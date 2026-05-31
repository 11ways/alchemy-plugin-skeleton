/**
 * MCP Session class - represents a client session with state
 *
 * Encapsulates all session state and behavior:
 * - Tool call history tracking
 * - Message injection queue
 * - Custom session data storage
 * - Session lifecycle management
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
const McpSession = Function.inherits('Thoth.Mcp.Base', 'Thoth.Mcp', function Session() {

	// Tool call history: { total_calls: number, by_tool: { [name]: ToolHistoryEntry } }
	this.tool_history = {
		total_calls : 0,
		by_tool     : {},
	};

	// Queued message injections
	this.queued_injections = [];

	// Custom data storage (for application-specific session data)
	this.custom_data = {};

	// Timestamp tracking for inject_reminder throttling
	this.last_reminder_times = {};

	// Timestamp tracking for auto_trigger throttling
	this.last_trigger_times = {};

	// Session creation timestamp
	this.created = null;

	// Last activity timestamp
	this.last_activity = null;

	// The API key document used for authentication
	this.api_key = null;

	// The user ID (from API key)
	this.user_id = null;

	// The user document
	this.user = null;

	// Current conduit reference (changes per request)
	this.conduit = null;

	// MCP SDK transport
	this.transport = null;

	// Internal SDK session handler
	this._sdk_handler = null;

	// Database document reference (for restored sessions)
	this._db_doc = null;

	// Flag indicating this session was auto-created (not from initialize request)
	this._auto_created = false;

	// Optional client info from MCP initialize
	this.client_info = null;

	// Pending upload slots created via `request_upload_path`, keyed by their
	// readable session-scoped reference (e.g. "U001"). The same slot object
	// is also indexed by its secret token on the manager. Scoping the
	// readable reference to the session is what keeps one session from
	// consuming another's upload.
	this.upload_slots = new Map();

	// Incrementing counter for readable upload references (U001, U002, ...)
	this._upload_seq = 0;
});

/**
 * Record a tool call in the history
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   tool_name   The name of the tool that was called
 */
McpSession.setMethod(function recordToolCall(tool_name) {
	
	let now = Date.now();
	
	// Increment total calls
	this.tool_history.total_calls++;
	
	// Update calls_since_last for all other tools
	for (let name in this.tool_history.by_tool) {
		this.tool_history.by_tool[name].incrementCallsSince();
	}
	
	// Get or create entry for this tool
	let entry = this.getOrCreateToolEntry(tool_name);
	
	// Record the call
	entry.recordCall(now);
});

/**
 * Get or create a tool history entry
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   tool_name   The name of the tool
 *
 * @return   {Thoth.Mcp.ToolHistoryEntry}
 */
McpSession.setMethod(function getOrCreateToolEntry(tool_name) {
	
	if (!this.tool_history.by_tool[tool_name]) {
		this.tool_history.by_tool[tool_name] = new Classes.Thoth.Mcp.ToolHistoryEntry();
	}
	
	return this.tool_history.by_tool[tool_name];
});

/**
 * Restore tool history from a plain object (e.g., from database)
 *
 * Converts plain objects back to ToolHistoryEntry instances
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}   data   Plain object with tool_history structure
 */
McpSession.setMethod(function restoreToolHistory(data) {
	
	if (!data) {
		return;
	}
	
	// Restore total_calls
	if (data.total_calls != null) {
		this.tool_history.total_calls = data.total_calls;
	}
	
	// Restore individual tool entries
	if (data.by_tool) {
		for (let tool_name in data.by_tool) {
			let plain_entry = data.by_tool[tool_name];
			let entry = this.getOrCreateToolEntry(tool_name);
			
			// Restore properties from plain object
			if (plain_entry.call_count != null) {
				entry.call_count = plain_entry.call_count;
			}
			if (plain_entry.last_called_at != null) {
				entry.last_called_at = plain_entry.last_called_at;
			}
			if (plain_entry.calls_since_last != null) {
				entry.calls_since_last = plain_entry.calls_since_last;
			}
		}
	}
});

/**
 * Check if a tool has been called (with optional constraints)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   tool_name
 * @param    {Object}   options
 * @param    {number}   options.max_calls_ago    - Must be within last N calls
 * @param    {number}   options.max_seconds_ago  - Must be within last N seconds
 *
 * @return   {boolean}
 */
McpSession.setMethod(function hasCalledTool(tool_name, options) {
	
	let entry = this.tool_history.by_tool[tool_name];
	
	if (!entry) {
		return false;
	}
	
	return entry.wasCalledWithin(options);
});

/**
 * Get tool history entry or full history
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   tool_name   Optional tool name to get specific entry
 *
 * @return   {Object}   The tool history entry or full history
 */
McpSession.setMethod(function getToolHistory(tool_name) {
	
	if (tool_name) {
		return this.tool_history.by_tool[tool_name] || null;
	}
	
	return this.tool_history;
});

/**
 * Queue an injection to be appended to the response
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   message
 * @param    {Object}   options
 * @param    {string}   options.priority   - 'high' (immediate) or 'normal' (next call)
 * @param    {string}   options.type       - 'notification', 'reminder', 'warning'
 */
McpSession.setMethod(function queueInjection(message, options) {
	
	this.queued_injections.push({
		message   : message,
		priority  : options?.priority || 'normal',
		type      : options?.type || 'notification',
		queued_at : Date.now(),
	});
});

/**
 * Get and clear queued injections
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {boolean}   high_priority_only   Only return high priority injections
 *
 * @return   {Array}
 */
McpSession.setMethod(function consumeInjections(high_priority_only) {
	
	let result;
	
	if (high_priority_only) {
		// Extract high priority items
		result = this.queued_injections.filter(i => i.priority === 'high');
		
		// Remove them from the array in place
		for (let i = this.queued_injections.length - 1; i >= 0; i--) {
			if (this.queued_injections[i].priority === 'high') {
				this.queued_injections.splice(i, 1);
			}
		}
	} else {
		// Return a copy and clear the array in place
		result = this.queued_injections.slice();
		this.queued_injections.length = 0;
	}
	
	return result;
});

/**
 * Format injections as text to append to response
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {string}
 */
McpSession.setMethod(function formatInjections() {
	
	let injections = this.consumeInjections();
	
	if (!injections.length) {
		return '';
	}
	
	let lines = ['\n---'];
	
	for (let injection of injections) {
		let prefix = injection.type === 'warning' ? '[!]' :
		             injection.type === 'reminder' ? '[i]' : '[*]';
		lines.push(prefix + ' ' + injection.message);
	}
	
	return lines.join('\n');
});

/**
 * Set custom data in the session
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   key     The key to store data under
 * @param    {*}        value   The value to store
 */
McpSession.setMethod(function setData(key, value) {
	this.custom_data[key] = value;
});

/**
 * Get custom data from the session
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   key            The key to retrieve
 * @param    {*}        default_value  Optional default if key not found
 *
 * @return   {*}        The stored value or default
 */
McpSession.setMethod(function getData(key, default_value) {
	
	let value = this.custom_data[key];
	
	if (value === undefined) {
		return default_value;
	}
	
	return value;
});

/**
 * Check if custom data exists in the session
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   key   The key to check
 *
 * @return   {boolean}
 */
McpSession.setMethod(function hasData(key) {
	return this.custom_data[key] !== undefined;
});

/**
 * Delete custom data from the session
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   key   The key to delete
 *
 * @return   {boolean}  True if key existed and was deleted
 */
McpSession.setMethod(function deleteData(key) {
	
	if (key in this.custom_data) {
		delete this.custom_data[key];
		return true;
	}
	
	return false;
});

/**
 * Update the last activity timestamp
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpSession.setMethod(function touch() {
	this.last_activity = Date.now();
});

/**
 * Check if the session has expired
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {number}   timeout_ms   Timeout in milliseconds (default: 1 hour)
 *
 * @return   {boolean}
 */
McpSession.setMethod(function isExpired(timeout_ms = 3600000) {
	
	let last_active = this.last_activity || this.created;
	
	if (!last_active) {
		return false;
	}
	
	return (Date.now() - last_active) > timeout_ms;
});

/**
 * Get the number of seconds since last activity
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {number}
 */
McpSession.setMethod(function getIdleSeconds() {
	
	let last_active = this.last_activity || this.created;
	
	if (!last_active) {
		return 0;
	}
	
	return Math.round((Date.now() - last_active) / 1000);
});
