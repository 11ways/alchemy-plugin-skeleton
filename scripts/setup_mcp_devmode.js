/**
 * MCP Development Mode Setup
 * 
 * This file is only loaded when --ai-devmode flag is passed.
 * It registers simplified JSON endpoints for CLI usage.
 *
 * These endpoints return plain JSON (not SSE) for easy scripting.
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
'use strict';

module.exports = function setupMcpDevmode() {

	/**
	 * Validate the AI devmode token
	 */
	function validateToken(conduit) {
		let provided_token = conduit.headers['x-ai-token'] || conduit.param('token');

		if (!provided_token) {
			conduit.status = 401;
			conduit.setHeader('Content-Type', 'application/json');
			conduit.end(JSON.stringify({error: 'Missing X-AI-Token header'}));
			return false;
		}

		if (provided_token !== alchemy.ai_devmode_token) {
			conduit.status = 401;
			conduit.setHeader('Content-Type', 'application/json');
			conduit.end(JSON.stringify({error: 'Invalid token'}));
			return false;
		}

		return true;
	}

	/**
	 * Get or create a dev session for the given MCP server and API key
	 */
	async function getOrCreateSession(server, api_key) {

		let manager = server.manager;
		let session_id = 'alchemy-dev:' + server.name + ':' + (api_key || 'anonymous');
		
		// Check if session already exists in the manager
		if (manager.sessions.has(session_id)) {
			let session = manager.sessions.get(session_id);
			session.last_activity = Date.now();
			return { session_id, session };
		}

		// Validate API key if provided
		let key_doc = null;
		let user = null;

		if (api_key) {
			key_doc = await manager.validateApiKey(api_key);

			if (key_doc?.user_id) {
				let User = Model.get('User');
				user = await User.findByPk(key_doc.user_id);
			}
		}

		let now = Date.now();

		// Create a minimal session object matching manager's structure
		let session = {
			_sdk_handler      : null,
			transport         : null,
			conduit           : null,
			api_key           : key_doc,
			user_id           : key_doc?.user_id || null,
			user              : user,
			created           : now,
			last_activity     : now,
			tool_history      : { total_calls: 0, by_tool: {} },
			queued_injections : [],
			client_info       : { name: 'alchemy-dev', version: '1.0' },
		};

		manager.sessions.set(session_id, session);
		return { session_id, session };
	}

	/**
	 * Get the first available MCP server
	 */
	function getDefaultServer() {
		let servers = alchemy.plugins.thoth.getAllMcpServers();

		for (let [name, server] of servers) {
			return server;
		}

		return null;
	}

	// Register the routes
	Router.add({
		name            : 'ThothMcpDev#list',
		paths           : '/_dev/mcp/list',
		methods         : ['get', 'post'],
		is_system_route : true,
	});

	Router.add({
		name            : 'ThothMcpDev#call',
		paths           : '/_dev/mcp/call',
		methods         : ['post'],
		is_system_route : true,
	});

	Router.add({
		name            : 'ThothMcpDev#servers',
		paths           : '/_dev/mcp/servers',
		methods         : ['get'],
		is_system_route : true,
	});

	// Define the controller
	const ThothMcpDev = Function.inherits('Alchemy.Controller', function ThothMcpDev(conduit, options) {
		ThothMcpDev.super.call(this, conduit, options);
	});

	/**
	 * List available MCP servers
	 */
	ThothMcpDev.setAction(function servers(conduit) {

		if (!validateToken(conduit)) return;

		let servers = alchemy.plugins.thoth.getAllMcpServers();
		let result = [];

		for (let [name, server] of servers) {
			result.push({
				name : name,
				path : server.path,
			});
		}

		conduit.setHeader('Content-Type', 'application/json');
		conduit.end(JSON.stringify(result, null, '\t'));
	});

	/**
	 * List available tools (plain JSON)
	 */
	ThothMcpDev.setAction(async function list(conduit) {

		if (!validateToken(conduit)) return;

		try {
			let server_name = conduit.param('server') || conduit.body?.server;
			let server;

			if (server_name) {
				server = alchemy.plugins.thoth.getMcpServer(server_name);
			} else {
				server = getDefaultServer();
			}

			if (!server) {
				conduit.status = 404;
				conduit.setHeader('Content-Type', 'application/json');
				conduit.end(JSON.stringify({error: 'No MCP server found'}));
				return;
			}

			let tools = [];

			for (let [name, tool] of server.manager.tools) {
				tools.push({
					name        : name,
					description : tool.description || '',
				});
			}

			conduit.setHeader('Content-Type', 'application/json');
			conduit.end(JSON.stringify({
				server : server.name,
				tools  : tools,
			}, null, '\t'));

		} catch (err) {
			conduit.status = 500;
			conduit.setHeader('Content-Type', 'application/json');
			conduit.end(JSON.stringify({error: err.message}));
		}
	});

	/**
	 * Call a tool (plain JSON response)
	 */
	ThothMcpDev.setAction(async function call(conduit) {

		if (!validateToken(conduit)) return;

		try {
			let body = conduit.body;
			let tool_name = body?.tool;
			let args = body?.args || {};
			let server_name = body?.server;
			let api_key = conduit.headers['x-api-key'];

			if (!tool_name) {
				conduit.status = 400;
				conduit.setHeader('Content-Type', 'application/json');
				conduit.end(JSON.stringify({error: 'Missing "tool" in request body'}));
				return;
			}

			let server;

			if (server_name) {
				server = alchemy.plugins.thoth.getMcpServer(server_name);
			} else {
				server = getDefaultServer();
			}

			if (!server) {
				conduit.status = 404;
				conduit.setHeader('Content-Type', 'application/json');
				conduit.end(JSON.stringify({error: 'No MCP server found'}));
				return;
			}

			// Get or create a persistent dev session
			let { session_id, session } = await getOrCreateSession(server, api_key);

			// Create a proper MCP conduit for the tool call
			let McpConduit = Classes.Thoth.Conduit.Mcp;
			let mcp_conduit = new McpConduit(conduit);
			mcp_conduit.setMcpSession(session);
			mcp_conduit.mcp_server = server;

			// Store the conduit reference in the session for tool execution
			session.conduit = mcp_conduit;

			// Execute the tool via the tool executor
			let result = await server.manager.tool_executor.executeToolInternal(mcp_conduit, tool_name, args);

			conduit.setHeader('Content-Type', 'application/json');
			conduit.end(JSON.stringify({
				server : server.name,
				tool   : tool_name,
				result : result,
			}, null, '\t'));

		} catch (err) {
			conduit.status = 500;
			conduit.setHeader('Content-Type', 'application/json');
			conduit.end(JSON.stringify({
				error : err.message,
				code  : err.code || 'INTERNAL_ERROR',
			}));
		}
	});

	log.info('MCP devmode endpoints registered at /_dev/mcp/*');
};
