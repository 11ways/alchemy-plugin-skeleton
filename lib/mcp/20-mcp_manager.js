/**
 * MCP Manager - manages MCP sessions for multiple clients
 *
 * Architecture Note:
 * ==================
 * The MCP SDK is designed for single-user scenarios (one process per client).
 * Its "Server" class only supports one transport/session at a time.
 * 
 * For our multi-tenant setup, we create one SDK Server instance per session.
 * Despite the name, these "Server" instances are lightweight session handlers,
 * not actual network servers. They just hold request handlers and protocol state.
 * 
 * Externally, we only talk about "sessions". The SDK Server instances are
 * an internal implementation detail stored as `_sdk_handler` in session data.
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
const McpManager = Function.inherits('Thoth.Mcp.Base', 'Thoth.Mcp', function Manager(server) {

	// Reference to the parent MCP server
	this.server = server;
	
	// Store active transports by session ID
	this.sessions = new Map();

	// Store registered tools
	this.tools = new Map();

	// Tool executor instance
	this.tool_executor = new Classes.Thoth.Mcp.ToolExecutor(this, this.tools);

	// Whether the manager has been initialized
	this.initialized = false;
});

/**
 * Initialize the MCP manager
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpManager.setMethod(async function initialize() {
	
	if (this.initialized) {
		return;
	}
	
	// Cache the SDK imports for creating session handlers later
	const serverModule = await import('@modelcontextprotocol/sdk/server/index.js');
	const typesModule = await import('@modelcontextprotocol/sdk/types.js');
	const transportModule = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
	
	this._ServerClass = serverModule.Server;
	this._ListToolsRequestSchema = typesModule.ListToolsRequestSchema;
	this._CallToolRequestSchema = typesModule.CallToolRequestSchema;
	this._isInitializeRequest = typesModule.isInitializeRequest;
	this._StreamableHTTPServerTransport = transportModule.StreamableHTTPServerTransport;
	
	// Store app info for SDK handler creation
	this._app_name = alchemy.settings.name || 'alchemy-app';
	this._app_version = alchemy.settings.version || '1.0.0';
	
	// Discover all tools first
	await this.discoverAllTools();
	
	// Validate auto_callable tools
	this.validateAutoCallableTools();
	
	this.initialized = true;
	
	// Start periodic session cleanup (every 60 seconds)
	setInterval(() => this.cleanupSessions(), 60000);
	
	log.info('MCP Manager initialized - Server:', this.server?.name || 'unknown', '- Tools:', this.tools.size);
});

/**
 * Check if an API key is allowed to access this server
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Document}   api_key_doc   The API key document
 *
 * @return   {boolean}
 */
McpManager.setMethod(function isApiKeyAllowedForServer(api_key_doc) {
	
	// If no server, allow all
	if (!this.server) {
		return true;
	}
	
	// If API key has no allowed_servers restriction, allow all
	if (!api_key_doc.allowed_servers?.length) {
		return true;
	}
	
	// Check if this server is in the allowed list
	return api_key_doc.allowed_servers.includes(this.server.name);
});

/**
 * Create the internal SDK handler for a session
 *
 * This creates a lightweight SDK "Server" instance (really just a session handler,
 * not a network server). Each session needs its own instance because the SDK
 * only supports one transport per Server.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {Server}   SDK Server instance with tool handlers configured
 */
McpManager.setMethod(function createSdkSessionHandler() {
	
	let handler = new this._ServerClass({
		name    : this._app_name,
		version : this._app_version,
	}, {
		capabilities: {
			tools: {},
		},
	});
	
	// Set up tool handlers on this SDK instance
	this.setupSdkToolHandlers(handler);
	
	return handler;
});

/**
 * Discover all tool classes and store them in our registry
 * Filters tools based on server configuration (tool_classes, tool_names)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpManager.setMethod(async function discoverAllTools() {
	
	let McpTools = Classes.Thoth?.Mcp?.Tools;
	
	if (!McpTools) {
		log.warning('Thoth.Mcp.Tools class not found');
		return;
	}
	
	// Get all descendants of the Tools class
	let tool_classes = McpTools.getDescendants();
	
	if (!tool_classes || tool_classes.length === 0) {
		log.info('No MCP tool classes found');
		return;
	}
	
	// Get filter configuration from parent server
	let allowed_classes = this.server?.tool_classes;
	let allowed_names = this.server?.tool_names;
	
	for (let ToolClass of tool_classes) {
		// Skip abstract classes
		if (ToolClass.is_abstract_class) {
			continue;
		}
		
		let class_name = ToolClass.name;
		
		// Filter by class name if configured
		if (allowed_classes && !allowed_classes.includes(class_name)) {
			continue;
		}
		
		let tools = ToolClass.getAllTools();
		
		for (let [name, tool] of tools) {
			// Filter by tool name if configured
			if (allowed_names && !allowed_names.includes(name)) {
				continue;
			}
			
			this.tools.set(name, tool);
			log.info('Discovered MCP tool:', name, '(server:', this.server?.name || 'unknown', ')');
		}
	}
});

/**
 * Validate that auto_callable tools have no required parameters
 * Throws an error at boot time if validation fails
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpManager.setMethod(function validateAutoCallableTools() {
	
	for (let [name, tool] of this.tools) {
		if (!tool.auto_callable) {
			continue;
		}
		
		// Check if the tool has any required parameters
		if (tool.schema) {
			let has_required = false;
			
			for (let field of tool.schema) {
				if (field.options?.required) {
					has_required = true;
					break;
				}
			}
			
			if (has_required) {
				throw new Error(
					`Tool "${name}" is marked as auto_callable but has required parameters. ` +
					`Auto-callable tools must have no required parameters.`
				);
			}
		}
	}
});

/**
 * Set up tool handlers on an SDK session handler
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Server}   sdk_handler   The SDK Server instance to configure
 */
McpManager.setMethod(function setupSdkToolHandlers(sdk_handler) {
	
	let that = this;
	
	// Handle tools/list - return proper JSON Schema for each tool
	sdk_handler.setRequestHandler(this._ListToolsRequestSchema, () => {
		
		let tool_list = [];
		
		for (let [name, tool] of that.tools) {
			let tool_def = {
				name        : name,
				description : tool.description || '',
			};
			
			// Convert Alchemy schema to JSON Schema
			if (tool.schema) {
				tool_def.inputSchema = tool.schema.toJsonSchema({
					option_prefix: 'mcp_',
				});
			} else {
				// Empty schema if no parameters
				tool_def.inputSchema = {
					type       : 'object',
					properties : {},
				};
			}
			
			tool_list.push(tool_def);
		}
		
		return { tools: tool_list };
	});
	
	// Handle tools/call - delegate to executor
	sdk_handler.setRequestHandler(this._CallToolRequestSchema, async (request, extra) => {
		
		let tool_name = request.params?.name;
		let args = request.params?.arguments || {};
		
		// Let executeTool handle everything including tool lookup and error formatting
		return that.tool_executor.executeTool(tool_name, args, extra);
	});
});

/**
 * Execute a tool with proper context (delegates to ToolExecutor)
 * This is the main entry point from MCP protocol
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}   tool     The tool definition
 * @param    {Object}   params   The parameters from the MCP client
 * @param    {Object}   extra    Extra info from MCP (sessionId, etc.)
 *
 * @return   {Object}   MCP-formatted result
 */
McpManager.setMethod(function executeTool(tool, params, extra) {
	return this.tool_executor.executeTool(tool, params, extra);
});

/**
 * Execute a tool internally (delegates to ToolExecutor)
 * This is the public API for calling tools from other code (e.g., conduit.callTool)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Thoth.Conduit.Mcp}   conduit     The MCP conduit
 * @param    {string}              tool_name   The tool name to execute
 * @param    {Object}              params      The parameters
 *
 * @return   {*}   The raw result from the tool
 */
McpManager.setMethod(function executeToolInternal(conduit, tool_name, params = {}) {
	return this.tool_executor.executeToolInternal(conduit, tool_name, params);
});

/**
 * Format a tool result for MCP response (delegates to ToolExecutor)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {*}        result       The result from the tool handler
 * @param    {Thoth.Conduit.Mcp}   conduit      The MCP conduit (optional)
 * @param    {Array}    auto_called  Array of {tool_name, result} for auto-called tools
 *
 * @return   {Object}   MCP-formatted result
 */
McpManager.setMethod(function formatResult(result, conduit, auto_called = []) {
	return this.tool_executor.formatResult(result, conduit, auto_called);
});

/**
 * Process inject_reminder settings for all tools (delegates to ToolExecutor)
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Thoth.Conduit.Mcp}   conduit   The MCP conduit
 */
McpManager.setMethod(function processInjectReminders(conduit) {
	return this.tool_executor.processInjectReminders(conduit);
});

/**
 * Extract API key from the conduit
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Thoth.Conduit.Mcp}   conduit
 *
 * @return   {string|null}
 */
McpManager.setMethod(function extractApiKey(conduit) {
	
	// Check Authorization header (Bearer token)
	let auth_header = conduit.headers['authorization'];
	
	if (auth_header && auth_header.startsWith('Bearer ')) {
		return auth_header.slice(7);
	}
	
	// Check X-API-Key header
	let api_key_header = conduit.headers['x-api-key'];
	
	if (api_key_header) {
		return api_key_header;
	}
	
	return null;
});

/**
 * Validate an API key and return the key document
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   raw_key
 *
 * @return   {Document|null}
 */
McpManager.setMethod(async function validateApiKey(raw_key) {
	
	if (!raw_key) {
		return null;
	}
	
	let McpApiKey = Model.get('Thoth_McpApiKey');
	
	return McpApiKey.findByRawKey(raw_key);
});

/**
 * Send a JSON-RPC error response
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpManager.setMethod(function sendJsonRpcError(conduit, status, code, message) {
	conduit.status = status;
	return conduit.end({
		jsonrpc : '2.0',
		error   : { code, message },
		id      : null,
	});
});

/**
 * Extract session ID from request headers or cookies
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpManager.setMethod(function extractSessionId(conduit) {
	return conduit.headers['mcp-session-id'] || conduit.cookies?.['mcp_session_id'] || null;
});

/**
 * Authenticate a new session request via API key
 * Returns null on success (key stored on conduit), or an error response
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpManager.setMethod(async function authenticateNewSession(conduit) {
	
	let require_api_key = this.server?.require_api_key ?? true;
	let allow_anonymous = this.server?.allow_anonymous ?? false;
	
	if (!require_api_key) {
		return null; // No auth required
	}
	
	let api_key = this.extractApiKey(conduit);
	
	if (!api_key && !allow_anonymous) {
		return this.sendJsonRpcError(conduit, 401, -32001, 'API key required');
	}
	
	if (!api_key) {
		return null; // Anonymous allowed, no key provided
	}
	
	let key_doc = await this.validateApiKey(api_key);
	
	if (!key_doc) {
		return this.sendJsonRpcError(conduit, 401, -32001, 'Invalid API key');
	}
	
	if (!this.isApiKeyAllowedForServer(key_doc)) {
		return this.sendJsonRpcError(conduit, 403, -32001, 'API key not authorized for this server');
	}
	
	// Store key doc for session creation
	conduit._mcp_api_key = key_doc;
	return null;
});

/**
 * Try to recover an existing session for sticky session support
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpManager.setMethod(function tryRecoverExistingSession(conduit) {
	
	if (!conduit._mcp_api_key?.user_id || !this.shouldRecoverSession(conduit)) {
		return null;
	}
	
	let recovered = this.tryRecoverSession(conduit._mcp_api_key.user_id);
	
	if (recovered) {
		recovered.session.conduit = conduit;
		recovered.session.last_activity = Date.now();
	}
	
	return recovered;
});

/**
 * Create a new session transport with SDK handler
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpManager.setMethod(async function createSessionTransport(conduit, existing_session, session_id) {
	
	let that = this;
	let sdk_handler = this.createSdkSessionHandler();
	
	let transport = new this._StreamableHTTPServerTransport({
		sessionIdGenerator: () => existing_session ? session_id : Blast.Classes.Crypto.randomHex(16),
		onsessioninitialized: async (sid) => {
			if (existing_session) {
				// Reconnection - update existing session
				existing_session._sdk_handler = sdk_handler;
				existing_session.transport = transport;
				existing_session.conduit = conduit;
				existing_session.last_activity = Date.now();
				
				// If this was auto-created, persist to database
				if (existing_session._auto_created) {
					that.persistSessionToDb(sid, existing_session).catch(err => {
						log.warning('Failed to persist auto-created MCP session:', err.message);
					});
				}
			} else {
				// New session
				await that.createNewSession(sid, sdk_handler, transport, conduit);
			}
		},
	});

	transport.onerror = (err) => {
		log.error('MCP transport onerror:', err);
	};

	await sdk_handler.connect(transport);
	
	// Store transport on existing session immediately (don't rely on onsessioninitialized
	// which only fires for 'initialize' requests, not for tool calls)
	if (existing_session) {
		existing_session._sdk_handler = sdk_handler;
		existing_session.transport = transport;
		existing_session.conduit = conduit;
		existing_session.last_activity = Date.now();
		
		// HACK: Workaround for MCP SDK + Claude Desktop incompatibility
		// 
		// The Problem:
		// - Claude Desktop persists session IDs and reuses them across server restarts
		// - When our server restarts, in-memory session state (including SDK transport) is lost
		// - Claude Desktop sends tool calls with the old session ID WITHOUT re-initializing
		// - The MCP SDK's transport maintains internal state (_initialized, sessionId) that
		//   determines whether it will accept tool calls
		// - A fresh transport has _initialized=false, so it rejects/ignores tool calls
		//
		// The Workaround:
		// Manually set the SDK transport's internal state to "already initialized" so it
		// accepts tool calls from clients that skip the initialize handshake.
		//
		// This is accessing private SDK internals and may break with SDK updates.
		// TODO: Report this to the MCP SDK maintainers - the SDK should either:
		//   1. Provide a way to restore session state, or
		//   2. Handle clients that reconnect without re-initializing
		//
		if (session_id && transport._webStandardTransport) {
			transport._webStandardTransport.sessionId = session_id;
			transport._webStandardTransport._initialized = true;
		}
		
		// If this was auto-created, persist to database
		if (existing_session._auto_created) {
			this.persistSessionToDb(session_id, existing_session).catch(err => {
				log.warning('Failed to persist auto-created MCP session:', err.message);
			});
		}
	}
	
	return transport;
});

/**
 * Create a new McpSession instance with the given options
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}   options   Properties to set on the session
 *
 * @return   {Thoth.Mcp.Session}   Session instance
 */
McpManager.setMethod(function createSessionData(options = {}) {

	let now = Date.now();
	let session = new Classes.Thoth.Mcp.Session();
	
	// Set timestamps
	session.created = options.created || now;
	session.last_activity = options.last_activity || now;
	
	// Restore tool_history if provided (e.g., from database)
	if (options.tool_history) {
		session.restoreToolHistory(options.tool_history);
	}
	
	// Restore queued_injections if provided
	if (options.queued_injections) {
		session.queued_injections = options.queued_injections;
	}
	
	// Set other properties
	if (options._sdk_handler !== undefined) session._sdk_handler = options._sdk_handler;
	if (options.transport !== undefined) session.transport = options.transport;
	if (options.conduit !== undefined) session.conduit = options.conduit;
	if (options.api_key !== undefined) session.api_key = options.api_key;
	if (options.user_id !== undefined) session.user_id = options.user_id;
	if (options.user !== undefined) session.user = options.user;
	if (options._db_doc !== undefined) session._db_doc = options._db_doc;
	if (options._auto_created !== undefined) session._auto_created = options._auto_created;
	if (options.client_info !== undefined) session.client_info = options.client_info;

	return session;
});

/**
 * Load the User document for a session from its id. Centralised so that
 * every session-creation path (new, db-restored, auto-created) binds the
 * user the same way - permission checks depend on `session.user` being
 * populated, not just `user_id`.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.1
 *
 * @param    {ObjectId|string}   user_id
 *
 * @return   {Promise<Document.User|null>}
 */
McpManager.setMethod(async function loadSessionUser(user_id) {

	if (!user_id) {
		return null;
	}

	return Model.get('User').findByPk(user_id);
});

/**
 * Create a new session and store it
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpManager.setMethod(async function createNewSession(session_id, sdk_handler, transport, conduit) {

	// Create in-memory session
	let session = this.createSessionData({
		_sdk_handler : sdk_handler,
		transport    : transport,
		conduit      : conduit,
		api_key      : conduit._mcp_api_key || null,
		user_id      : conduit._mcp_api_key?.user_id || null,
		user         : await this.loadSessionUser(conduit._mcp_api_key?.user_id),
	});

	this.sessions.set(session_id, session);
	
	// Persist to database (async, don't block)
	this.persistSessionToDb(session_id, session).catch(err => {
		log.warning('Failed to persist MCP session to database:', err.message);
	});
});

/**
 * Persist a session to the database
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   session_id   The session ID
 * @param    {Object}   session      The in-memory session object
 */
McpManager.setMethod(async function persistSessionToDb(session_id, session) {
	
	let McpSession = Model.get('Thoth.McpSession');
	
	await McpSession.findOrCreate(session_id, {
		server_name  : this.server?.name,
		api_key_id   : session.api_key?.$pk,
		user_id      : session.user_id,
		client_info  : session.client_info,
		tool_history : session.tool_history,
	});
});

/**
 * Try to restore a session from the database
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   session_id   The session ID to restore
 *
 * @return   {Document|null}   The session document or null
 */
McpManager.setMethod(async function tryRestoreSessionFromDb(session_id) {
	
	let McpSession = Model.get('Thoth.McpSession');
	let session_doc = await McpSession.findBySessionId(session_id);
	
	if (!session_doc) {
		return null;
	}
	
	// Update last activity in DB
	session_doc.touch().catch(() => {});
	
	return session_doc;
});

/**
 * Set session cookie and header on the response
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpManager.setMethod(function setSessionCookie(conduit, session_id) {
	
	if (!session_id || !conduit.cookie) {
		return;
	}
	
	conduit.cookie('mcp_session_id', session_id, {
		maxAge    : 31536000000, // 1 year
		overwrite : true,
		httpOnly  : true,
		sameSite  : 'Lax',
	});
	
	if (conduit.response?.setHeader) {
		conduit.response.setHeader('Mcp-Session-Id', session_id);
	}
});

/**
 * Handle incoming HTTP request
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Thoth.Conduit.Mcp}   conduit
 * @param    {Object}              body      Parsed request body (for POST)
 */
McpManager.setMethod(async function handleRequest(conduit, body) {
	
	// Ensure manager is initialized
	if (!this.initialized) {
		await this.initialize();
	}
	
	let session_id = this.extractSessionId(conduit);
	let existing_session = session_id ? this.sessions.get(session_id) : null;
	let is_init_request = body ? this._isInitializeRequest(body) : false;
	let transport = existing_session?.transport;
	let needs_new_transport = false;
	
	// Update existing session's conduit and activity
	if (existing_session) {
		existing_session.conduit = conduit;
		existing_session.last_activity = Date.now();
	}
	
	// Determine what kind of request this is and handle accordingly
	if (!session_id && is_init_request) {
		// New session initialization
		let auth_error = await this.authenticateNewSession(conduit);
		if (auth_error) return;
		
		// Try sticky session recovery
		let recovered = this.tryRecoverExistingSession(conduit);
		if (recovered) {
			existing_session = recovered.session;
			session_id = recovered.session_id;
		}
		
		needs_new_transport = true;
	}
	else if (existing_session && is_init_request) {
		// Reconnection with existing session
		needs_new_transport = true;
	}
	else if (!session_id && !existing_session) {
		// No session and not initializing
		return this.sendJsonRpcError(conduit, 400, -32000, 'Bad Request: No valid session ID provided');
	}
	else if (session_id && !existing_session) {
		// Session ID provided but not found in memory - try database
		let session_doc = await this.tryRestoreSessionFromDb(session_id);
		
		// Check again after async call - another request may have restored it
		existing_session = this.sessions.get(session_id);
		
		if (existing_session) {
			// Another request already restored this session - use it
			existing_session.conduit = conduit;
			existing_session.last_activity = Date.now();
			needs_new_transport = !existing_session.transport;
		} else if (session_doc) {
			// Found in database - restore and authenticate
			// Re-authenticate using the API key from the database session
			let api_key = null;
			if (session_doc.api_key_id) {
				let McpApiKey = Model.get('Thoth.McpApiKey');
				api_key = await McpApiKey.findByPk(session_doc.api_key_id);
				
				if (api_key && api_key.is_active) {
					conduit._mcp_api_key = api_key;
				} else {
					api_key = null;
				}
			}
			
			// Restore session from database. Load the user document too -
			// permission checks read `session.user` (via conduit.session
			// ('UserData')), so a restored session with only `user_id` set
			// would be treated as unauthenticated.
			existing_session = this.createSessionData({
				tool_history : session_doc.tool_history,
				user_id      : session_doc.user_id,
				user         : await this.loadSessionUser(session_doc.user_id),
				api_key      : api_key,
				created      : session_doc.created?.getTime(),
				_db_doc      : session_doc,
			});
			
			// Add to in-memory Map
			this.sessions.set(session_id, existing_session);
			
			// Need new transport since the old one is gone
			needs_new_transport = true;
		} else {
			// Not in database either - auto-create for resilient handling
			// Try to authenticate if API key provided in request
			let auth_error = await this.authenticateNewSession(conduit);
			if (auth_error) return;
			
			// Create a minimal existing_session so we keep the client's session_id.
			// Load the user document - permission checks read `session.user`,
			// so without it an auto-recreated session (e.g. a client
			// reconnecting after a server restart) would be denied every
			// permission despite a valid API key.
			existing_session = this.createSessionData({
				user_id       : conduit._mcp_api_key?.user_id,
				user          : await this.loadSessionUser(conduit._mcp_api_key?.user_id),
				api_key       : conduit._mcp_api_key,
				_auto_created : true,
			});
			
			// Add to in-memory Map
			this.sessions.set(session_id, existing_session);

			// Persist it too, so the next reconnect after a cleanup can be
			// restored from the DB (keeping its tool history) instead of
			// auto-creating from scratch again.
			this.persistSessionToDb(session_id, existing_session).catch(err => {
				log.warning("Failed to persist auto-created MCP session to database:", err.message);
			});

			// Treat as reconnection to keep the session_id
			needs_new_transport = true;
		}
	}
	
	// Create new transport if needed
	if (needs_new_transport) {
		transport = await this.createSessionTransport(conduit, existing_session, session_id);
		// Update session_id from transport if this was a new session
		session_id = transport.sessionId || session_id;
	}
	
	// Set session cookie
	this.setSessionCookie(conduit, session_id);
	
	// Delegate to transport
	try {
		await transport.handleRequest(conduit.request, conduit.response, body);
	} catch (err) {
		log.error('MCP transport error:', err);
		if (conduit.response && !conduit.response.headersSent) {
			this.sendJsonRpcError(conduit, 500, -32603, 'Transport error: ' + err.message);
		}
	}
});

/**
 * Check if session recovery is enabled for this request
 * 
 * Session recovery is opt-in via:
 * 1. X-MCP-Recover-Session header (value: "true", "1", or "yes")
 * 2. Configured in the API key's default_headers
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Thoth.Conduit.Mcp}   conduit   The MCP conduit
 *
 * @return   {boolean}   Whether session recovery should be attempted
 */
McpManager.setMethod(function shouldRecoverSession(conduit) {
	return conduit.getHeaderAsBoolean('x-mcp-recover-session');
});

/**
 * Try to recover an existing session for a user
 * 
 * Some MCP clients incorrectly close/delete their session after each message.
 * This method finds the most recent active session for a user so we can
 * preserve tool history and other session state.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {ObjectId|string}   user_id   The user ID to find a session for
 *
 * @return   {Object|null}   {session, session_id} or null if not found
 */
McpManager.setMethod(function tryRecoverSession(user_id) {
	
	if (!user_id) {
		return null;
	}
	
	let user_id_str = String(user_id);
	let newest_session = null;
	let newest_sid = null;
	
	for (let [sid, session] of this.sessions) {
		// Compare as strings to handle ObjectId vs string mismatch
		if (String(session.user_id) === user_id_str) {
			if (!newest_session || session.last_activity > newest_session.last_activity) {
				newest_session = session;
				newest_sid = sid;
			}
		}
	}
	
	if (newest_session) {
		return {
			session    : newest_session,
			session_id : newest_sid,
		};
	}
	
	return null;
});

/**
 * Clean up expired sessions
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpManager.setMethod(function cleanupSessions() {
	
	// Get timeout from parent server, or use default
	let timeout = this.server?.session_timeout ?? 3600000;
	let now = Date.now();
	
	for (let [sid, session] of this.sessions) {
		// Use last_activity if available, fall back to created for older sessions
		let last_active = session.last_activity || session.created;
		
		if (now - last_active > timeout) {
			if (session.transport && typeof session.transport.close === 'function') {
				session.transport.close();
			}
			
			this.sessions.delete(sid);
		}
	}
});

/**
 * Get the authenticated user for a session
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   session_id   The MCP session ID
 *
 * @return   {Document|null}   The User document or null
 */
McpManager.setMethod(function getSessionUser(session_id) {
	let session = this.sessions.get(session_id);
	return session?.user || null;
});

/**
 * Get list of tools visible to a specific API key
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Document}   api_key_doc   The API key document
 *
 * @return   {Array}   Array of tool names
 */
McpManager.setMethod(async function getVisibleTools(api_key_doc) {
	
	let visible = [];
	
	for (let [name, tool] of this.tools) {
		// Check if tool has permission requirement
		if (tool.permission) {
			// Check if API key has permission (checks key first, then User)
			if (api_key_doc && await api_key_doc.hasPermission(tool.permission)) {
				visible.push(name);
			}
		} else {
			// No permission required, always visible
			visible.push(name);
		}
	}
	
	return visible;
});
