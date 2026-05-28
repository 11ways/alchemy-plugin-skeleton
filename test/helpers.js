/**
 * Shared test helpers for alchemy-thoth tests
 */

/**
 * Create a mock original conduit object (what Alchemy passes to McpConduit)
 * 
 * @param    {Object}   overrides   Properties to override
 * @return   {Object}
 */
function createMockOriginalConduit(overrides = {}) {
	return {
		request: {},
		response: {},
		headers: {},
		router: null,
		route: null,
		section: null,
		sectionPath: '',
		params: {},
		route_string_parameters: null,
		path_definition: null,
		url: '/test',
		original_url: '/test',
		method: 'POST',
		path: '/test',
		body: null,
		files: null,
		scene_id: null,
		languages: [],
		locales: [],
		active_prefix: '',
		prefix: '',
		status: 200,
		response_headers: {},
		new_cookies: {},
		new_cookie_header: '',
		start: Date.now(),
		ajax: false,
		debuglog: [],
		_debugObject: null,
		session_instance: null,
		...overrides,
	};
}

/**
 * Create an MCP conduit instance with mock original
 * 
 * @param    {Object}   overrides   Properties to override on the original conduit
 * @return   {Thoth.Conduit.Mcp}
 */
function createMockConduit(overrides = {}) {
	let McpConduit = Classes.Thoth.Conduit.Mcp;
	return new McpConduit(createMockOriginalConduit(overrides));
}

/**
 * Create a mock MCP session instance
 * 
 * @param    {Object}   overrides   Properties to override
 * @return   {Thoth.Mcp.Session}
 */
function createMockSession(overrides = {}) {
	let McpSession = Classes.Thoth.Mcp.Session;
	let session = new McpSession();
	
	// Apply overrides
	for (let key in overrides) {
		session[key] = overrides[key];
	}
	
	return session;
}

/**
 * Create an MCP conduit with a session already attached
 * 
 * @param    {Object}   conduitOverrides   Properties to override on the original conduit
 * @param    {Object}   sessionOverrides   Properties to override on the session
 * @return   {Thoth.Conduit.Mcp}
 */
function createConduitWithSession(conduitOverrides = {}, sessionOverrides = {}) {
	let conduit = createMockConduit(conduitOverrides);
	conduit.setMcpSession(createMockSession(sessionOverrides));
	return conduit;
}

/**
 * Register a session with a manager (for testing)
 * 
 * @param    {McpManager}          manager      The manager to register with
 * @param    {string}              session_id   The session ID
 * @param    {Thoth.Mcp.Session}   session      The session instance
 * @param    {Thoth.Conduit.Mcp}   conduit      The conduit to associate
 */
function registerTestSession(manager, session_id, session, conduit) {
	// Set the conduit on the session
	session.conduit = conduit;
	
	// Register with manager
	manager.sessions.set(session_id, session);
	
	// Link conduit to session
	conduit.setMcpSession(session);
}

/**
 * Get the MCP endpoint URL
 * 
 * @param    {string}   server_name   Server name (default: 'test' -> /mcp)
 * @return   {string}
 */
function getMcpUrl(server_name = 'test') {
	let path = server_name === 'auth' ? '/mcp-auth' : '/mcp';
	// Use the global harness if available, otherwise fall back to alchemy.settings
	if (global.harness) {
		return harness.getUrl(path);
	}
	return 'http://localhost:' + alchemy.settings.network.port + path;
}

/**
 * Parse SSE response body and extract JSON-RPC messages
 * 
 * @param    {string}   sseBody   Raw SSE body
 * @return   {Array}              Array of parsed JSON-RPC messages
 */
function parseSSE(sseBody) {
	let messages = [];
	let lines = sseBody.split('\n');
	let currentData = '';

	for (let line of lines) {
		if (line.startsWith('data: ')) {
			currentData = line.substring(6);
		} else if (line === '' && currentData) {
			try {
				messages.push(JSON.parse(currentData));
			} catch (e) {
				// Ignore parse errors
			}
			currentData = '';
		}
	}

	if (currentData) {
		try {
			messages.push(JSON.parse(currentData));
		} catch (e) {
			// Ignore parse errors
		}
	}

	return messages;
}

/**
 * Extract the first JSON-RPC response from SSE body
 * 
 * @param    {string}   sseBody
 * @return   {Object|null}
 */
function extractResponse(sseBody) {
	let messages = parseSSE(sseBody);
	return messages.length > 0 ? messages[0] : null;
}

/**
 * Make an MCP request (async version)
 * 
 * @param    {string}   url          MCP endpoint URL
 * @param    {Object}   request      JSON-RPC request object
 * @param    {string}   session_id   Optional session ID
 * @return   {Promise<{result: Object, response: Object}>}
 */
async function mcpRequestAsync(url, request, session_id = null) {
	return new Promise((resolve, reject) => {
		let headers = {
			'Content-Type': 'application/json',
			'Accept': 'application/json, text/event-stream',
		};

		if (session_id) {
			headers['Mcp-Session-Id'] = session_id;
		}

		Blast.fetch(url, {
			method: 'POST',
			headers: headers,
			body: JSON.stringify(request),
		}, function(err, res, body) {
			if (err) return reject(err);

			let result;
			try {
				if (typeof body === 'string' && body.startsWith('event:')) {
					result = extractResponse(body);
				} else {
					result = typeof body === 'string' ? JSON.parse(body) : body;
				}
			} catch (e) {
				return reject(e);
			}

			resolve({ result, response: res });
		});
	});
}

/**
 * Initialize a new MCP session
 * 
 * @param    {string}   url           MCP endpoint URL
 * @param    {string}   client_name   Client name for initialization
 * @return   {Promise<string>}        Session ID
 */
async function initializeSession(url, client_name = 'test-client') {
	let { result, response } = await mcpRequestAsync(url, {
		jsonrpc: '2.0',
		id: 1,
		method: 'initialize',
		params: {
			protocolVersion: '2024-11-05',
			capabilities: {},
			clientInfo: { name: client_name, version: '1.0' },
		},
	});

	let session_id = response.headers['mcp-session-id'];
	
	if (!session_id) {
		throw new Error('No session ID returned from initialize');
	}

	return session_id;
}

/**
 * Call an MCP tool
 * 
 * @param    {string}   url          MCP endpoint URL
 * @param    {string}   session_id   Session ID
 * @param    {string}   tool_name    Tool to call
 * @param    {Object}   args         Tool arguments
 * @return   {Promise<Object>}       Tool result
 */
async function callTool(url, session_id, tool_name, args = {}) {
	let { result } = await mcpRequestAsync(url, {
		jsonrpc: '2.0',
		id: Date.now(),
		method: 'tools/call',
		params: {
			name: tool_name,
			arguments: args,
		},
	}, session_id);

	return result;
}

// Export helpers
module.exports = {
	createMockOriginalConduit,
	createMockConduit,
	createMockSession,
	createConduitWithSession,
	registerTestSession,
	getMcpUrl,
	parseSSE,
	extractResponse,
	mcpRequestAsync,
	initializeSession,
	callTool,
};
