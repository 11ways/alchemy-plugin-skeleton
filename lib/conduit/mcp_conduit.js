/**
 * The MCP Conduit Class
 * 
 * A specialized conduit for MCP requests that tracks tool call history
 * and supports message injections.
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Conduit}   original_conduit
 */
const McpConduit = Function.inherits('Alchemy.Conduit', 'Thoth.Conduit', function Mcp(original_conduit) {

	// Keep a reference to the original conduit
	this.original_conduit = original_conduit;

	// Call the parent constructor AFTER setting original_conduit
	Mcp.super.call(this);

	// Copy properties from original (like Loopback does)
	this.copyOriginalProperties(original_conduit);

	// Initialize MCP-specific state
	this.initMcpState();
});

/**
 * Delegate session_instance to original conduit (like Loopback does)
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpConduit.setProperty(function session_instance() {
	return this.original_conduit.session_instance;
});

/**
 * Copy properties from original conduit
 * (Similar to Loopback's copyParentProperties)
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Conduit}   conduit
 */
McpConduit.setMethod(function copyOriginalProperties(conduit) {

	// Core references
	this.request = conduit.request;
	this.response = conduit.response;

	// Update request's conduit reference
	if (this.request) {
		this.request.conduit = this;
	}

	// Headers and cookies
	this.headers = conduit.headers;
	if (Object.hasOwn(conduit, 'cookies')) {
		this.cookies = conduit.cookies;
	}

	// Routing state
	this.router = conduit.router;
	this.route = conduit.route;
	this.section = conduit.section;
	this.sectionPath = conduit.sectionPath;
	this.params = conduit.params;
	this.route_string_parameters = conduit.route_string_parameters;
	this.path_definition = conduit.path_definition;

	// URL/path state
	this.url = conduit.url;
	this.original_url = conduit.original_url;
	this.method = conduit.method;
	this.path = conduit.path;

	// Body and files
	this.body = conduit.body;
	this.files = conduit.files;

	// Scene - use internal property to avoid triggering setter
	this._scene_id = conduit.scene_id;

	// Locale
	this.languages = conduit.languages;
	this.locales = conduit.locales;
	this.active_prefix = conduit.active_prefix;
	this.prefix = conduit.prefix;

	// Response state
	this.status = conduit.status;
	this.response_headers = conduit.response_headers;
	this.new_cookies = conduit.new_cookies;
	this.new_cookie_header = conduit.new_cookie_header;

	// Other
	this.start = conduit.start;
	this.ajax = conduit.ajax;
	this.debuglog = conduit.debuglog;
	this._debugObject = conduit._debugObject;
});

/**
 * Reference to the MCP server handling this request
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpConduit.setProperty('mcp_server', null);

/**
 * Initialize MCP-specific state
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpConduit.setMethod(function initMcpState() {
	// MCP session reference (set later by manager)
	// All session state (tool_history, queued_injections) lives on the session object
	this.mcp_session = null;
	
	// The tool originally requested by the MCP client (never changes during request)
	this.original_tool = null;
	
	// The tool currently being executed (changes during nested callTool() calls)
	this.current_tool = null;
});

/**
 * Set the MCP session
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}   session   The MCP session object
 */
McpConduit.setMethod(function setMcpSession(session) {
	this.mcp_session = session;
});

/**
 * Get the MCP user
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {Object}   The MCP user or null
 */
McpConduit.setMethod(function getMcpUser() {
	return this.mcp_session?.user || null;
});

/**
 * Get the API key document for this request
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {Document|null}   The API key document or null
 */
McpConduit.setMethod(function getApiKey() {
	// Check both locations - _mcp_api_key is set during request handling,
	// mcp_session.api_key is available after session creation
	return this._mcp_api_key || this.mcp_session?.api_key || null;
});

/**
 * Get a header value, checking both request headers and API key defaults
 * 
 * This allows API keys to configure "virtual" headers via default_headers,
 * which is useful for options like X-MCP-Recover-Session.
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   name   The header name (case-insensitive)
 *
 * @return   {string|null}   The header value or null
 */
McpConduit.setMethod(function getHeader(name) {
	
	let lower_name = name.toLowerCase();
	
	// Check actual request headers first
	let value = this.headers?.[lower_name];
	
	if (value != null) {
		return value;
	}
	
	// Fall back to API key's default headers
	let api_key = this.getApiKey();
	
	if (api_key?.default_headers?.length) {
		for (let header of api_key.default_headers) {
			if (header.name?.toLowerCase() === lower_name) {
				return header.value;
			}
		}
	}
	
	return null;
});

/**
 * Get a header value as a boolean
 * 
 * Parses common truthy string values: "true", "1", "yes" (case-insensitive)
 * Returns false for all other values including null/undefined.
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   name   The header name (case-insensitive)
 *
 * @return   {boolean}
 */
McpConduit.setMethod(function getHeaderAsBoolean(name) {
	
	let value = this.getHeader(name);
	
	if (value == null) {
		return false;
	}
	
	switch (String(value).toLowerCase()) {
		case 'true':
		case '1':
		case 'yes':
			return true;
		default:
			return false;
	}
});

/**
 * Set custom data in the MCP session
 * This data persists for the lifetime of the MCP session (chat session),
 * not the HTTP request.
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   key     The key to store data under
 * @param    {*}        value   The value to store
 */
McpConduit.setMethod(function setMcpData(key, value) {
	
	if (!this.mcp_session) {
		throw new Error('Cannot set MCP data: no session available');
	}
	
	return this.mcp_session.setData(key, value);
});

/**
 * Get custom data from the MCP session
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   key            The key to retrieve
 * @param    {*}        default_value  Optional default if key not found
 *
 * @return   {*}        The stored value or default
 */
McpConduit.setMethod(function getMcpData(key, default_value) {
	
	if (!this.mcp_session) {
		return default_value;
	}
	
	return this.mcp_session.getData(key, default_value);
});

/**
 * Check if custom data exists in the MCP session
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   key   The key to check
 *
 * @return   {boolean}
 */
McpConduit.setMethod(function hasMcpData(key) {
	return this.mcp_session?.hasData(key) || false;
});

/**
 * Delete custom data from the MCP session
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   key   The key to delete
 *
 * @return   {boolean}  True if key existed and was deleted
 */
McpConduit.setMethod(function deleteMcpData(key) {
	
	if (!this.mcp_session) {
		return false;
	}
	
	return this.mcp_session.deleteData(key);
});

/**
 * Record a tool call (delegates to session)
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   tool_name   The name of the tool that was called
 */
McpConduit.setMethod(function recordToolCall(tool_name) {
	
	if (!this.mcp_session) {
		throw new Error('Cannot record tool call: no MCP session available');
	}
	
	return this.mcp_session.recordToolCall(tool_name);
});

/**
 * Check if a tool has been called (delegates to session)
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
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
McpConduit.setMethod(function hasCalledTool(tool_name, options) {
	
	if (!this.mcp_session) {
		return false;
	}
	
	return this.mcp_session.hasCalledTool(tool_name, options);
});

/**
 * Get tool history entry (delegates to session)
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   tool_name   Optional tool name to get specific entry
 *
 * @return   {Object}   The tool history entry or full history
 */
McpConduit.setMethod(function getToolHistory(tool_name) {
	
	if (!this.mcp_session) {
		return null;
	}
	
	return this.mcp_session.getToolHistory(tool_name);
});

/**
 * Queue an injection to be appended to the response (delegates to session)
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   message
 * @param    {Object}   options
 * @param    {string}   options.priority   - 'high' (immediate) or 'normal' (next call)
 * @param    {string}   options.type       - 'notification', 'reminder', 'warning'
 */
McpConduit.setMethod(function queueInjection(message, options) {
	
	if (!this.mcp_session) {
		throw new Error('Cannot queue injection: no MCP session available');
	}
	
	return this.mcp_session.queueInjection(message, options);
});

/**
 * Get and clear queued injections (delegates to session)
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {boolean}   high_priority_only   Only return high priority injections
 *
 * @return   {Array}
 */
McpConduit.setMethod(function consumeInjections(high_priority_only) {
	
	if (!this.mcp_session) {
		return [];
	}
	
	return this.mcp_session.consumeInjections(high_priority_only);
});

/**
 * Format injections as text to append to response (delegates to session)
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {string}
 */
McpConduit.setMethod(function formatInjections() {
	
	if (!this.mcp_session) {
		return '';
	}
	
	return this.mcp_session.formatInjections();
});

/**
 * Check if this tool execution is an auto-call (called automatically
 * as a prerequisite for another tool, not directly requested by the client)
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {boolean}
 */
McpConduit.setMethod(function isAutoCall() {
	// If original_tool differs from current_tool, this is an auto-call
	return this.original_tool != null && this.original_tool !== this.current_tool;
});

/**
 * Call another tool from within a tool handler.
 * This properly tracks the call in history and returns the raw result.
 * 
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   tool_name   The name of the tool to call
 * @param    {Object}   params      The parameters to pass (optional)
 *
 * @return   {*}   The raw result from the tool
 */
McpConduit.setMethod(function callTool(tool_name, params = {}) {
	
	let manager = this.mcp_server?.manager;
	
	if (!manager) {
		throw new Error('Cannot call tool: no MCP manager available');
	}
	
	return manager.executeToolInternal(this, tool_name, params);
});
