/**
 * ThothMcpSession model - persists MCP sessions across server restarts
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}    options
 */
const ThothMcpSession = Function.inherits('Alchemy.Model.Thoth.Base', 'McpSession');

/**
 * Constitute the class wide schema
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
ThothMcpSession.constitute(function addFields() {
	
	// The session ID (hex string used in MCP-Session-Id header)
	this.addField('session_id', 'String', {
		description : 'The MCP session ID',
		required    : true,
	});
	
	// Link to the API key used for this session (optional)
	this.belongsTo('ApiKey', 'Thoth.McpApiKey', {
		description : 'API key used to authenticate this session',
	});
	
	// Link to the user
	this.belongsTo('User', {
		description : 'User associated with this session',
	});
	
	// The MCP server name this session is for
	this.addField('server_name', 'String', {
		description : 'Name of the MCP server this session is for',
	});
	
	// Client info reported during initialization
	this.addField('client_info', 'Object', {
		description : 'Client information from MCP initialize request',
	});
	
	// Protocol version negotiated
	this.addField('protocol_version', 'String', {
		description : 'MCP protocol version negotiated with client',
	});
	
	// Tool call history/statistics
	this.addField('tool_history', 'Object', {
		description : 'Tool call statistics for this session',
		default     : { total_calls: 0, by_tool: {} },
	});
	
	// Last activity timestamp
	this.addField('last_activity', 'Datetime', {
		description : 'When this session was last active',
	});
	
	// Whether the session is still active
	this.addField('is_active', 'Boolean', {
		default     : true,
		description : 'Whether this session is still active',
	});
	
	// Add index on session_id for fast lookups
	this.addIndex('session_id', {unique: true});
});

/**
 * Configure chimera for this model
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
ThothMcpSession.constitute(function chimeraConfig() {
	
	if (!this.chimera) {
		return;
	}
	
	// Get the list group
	const list = this.chimera.getActionFields('list');
	
	list.addField('session_id');
	list.addField('server_name');
	list.addField('User.title', {title: 'User'});
	list.addField('is_active');
	list.addField('last_activity');
	list.addField('created');
	
	// Get the edit group
	const edit = this.chimera.getActionFields('edit');
	
	edit.addField('session_id');
	edit.addField('server_name');
	edit.addField('api_key_id');
	edit.addField('user_id');
	edit.addField('client_info');
	edit.addField('protocol_version');
	edit.addField('tool_history');
	edit.addField('is_active');
	edit.addField('last_activity');
});

/**
 * Find a session by its session_id
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   session_id   The MCP session ID
 *
 * @return   {Document|null}
 */
ThothMcpSession.setMethod(async function findBySessionId(session_id) {
	
	if (!session_id || typeof session_id !== 'string') {
		return null;
	}
	
	let crit = this.find();
	crit.where('session_id').equals(session_id);
	crit.where('is_active').equals(true);
	
	return this.find('first', crit);
});

/**
 * Find or create a session by session_id
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   session_id    The MCP session ID
 * @param    {Object}   defaults      Default values for new session
 *
 * @return   {Document}
 */
ThothMcpSession.setMethod(async function findOrCreate(session_id, defaults = {}) {
	
	let existing = await this.findBySessionId(session_id);
	
	if (existing) {
		return existing;
	}
	
	// Create new session
	let doc = this.createDocument({
		session_id    : session_id,
		server_name   : defaults.server_name,
		api_key_id    : defaults.api_key_id,
		user_id       : defaults.user_id,
		client_info   : defaults.client_info,
		tool_history  : { total_calls: 0, by_tool: {} },
		last_activity : new Date(),
		is_active     : true,
	});
	
	await doc.save();
	
	return doc;
});

/**
 * Update last activity timestamp (throttled to reduce DB writes)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {number}   throttle_ms   Minimum time between updates (default: 60000)
 */
ThothMcpSession.setDocumentMethod(async function touch(throttle_ms = 60000) {
	
	let now = new Date();
	let should_update = !this.last_activity || (now - this.last_activity) > throttle_ms;
	
	if (should_update) {
		this.last_activity = now;
		await this.save();
	}
});

/**
 * Record a tool call in the session history
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   tool_name   The tool that was called
 */
ThothMcpSession.setDocumentMethod(function recordToolCall(tool_name) {
	
	if (!this.tool_history) {
		this.tool_history = { total_calls: 0, by_tool: {} };
	}
	
	this.tool_history.total_calls = (this.tool_history.total_calls || 0) + 1;
	
	if (!this.tool_history.by_tool) {
		this.tool_history.by_tool = {};
	}
	
	this.tool_history.by_tool[tool_name] = (this.tool_history.by_tool[tool_name] || 0) + 1;
});

/**
 * Deactivate this session
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
ThothMcpSession.setDocumentMethod(async function deactivate() {
	this.is_active = false;
	await this.save();
});

/**
 * Clean up old inactive sessions
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {number}   max_age_ms   Maximum age of inactive sessions (default: 30 days)
 *
 * @return   {number}   Number of sessions removed
 */
ThothMcpSession.setMethod(async function cleanupOldSessions(max_age_ms = 30 * 24 * 60 * 60 * 1000) {
	
	let cutoff = new Date(Date.now() - max_age_ms);
	
	let crit = this.find();
	crit.where('last_activity').lt(cutoff);
	
	let old_sessions = await this.find('all', crit);
	let count = 0;
	
	for (let session of old_sessions) {
		await session.remove();
		count++;
	}
	
	return count;
});
