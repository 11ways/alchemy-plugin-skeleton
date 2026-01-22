/**
 * Thoth MCP Controller - handles MCP endpoint requests
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
const ThothMcp = Function.inherits('Alchemy.Controller', 'ThothMcp');

/**
 * Set CORS headers for browser-based MCP clients
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Conduit}   conduit
 * @param    {string}    type
 *
 * @return   {boolean}
 */
ThothMcp.setMethod(function beforeAction(conduit, type) {
	
	// Set CORS headers (if response exists)
	if (conduit.response?.setHeader) {
		conduit.response.setHeader('Access-Control-Allow-Origin', '*');
		conduit.response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
		conduit.response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, Mcp-Session-Id');
		conduit.response.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
	}
	
	return true;
});

/**
 * Handle OPTIONS preflight requests
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Conduit}   conduit
 */
ThothMcp.setAction(function options(conduit) {
	conduit.status = 204;
	conduit.end();
});

/**
 * Get the MCP server for this request
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Conduit}   conduit
 *
 * @return   {Thoth.Mcp.Server}
 */
ThothMcp.setMethod(function getServer(conduit) {
	
	// Get server name from route options
	let server_name = conduit.route?.options?.mcp_server;
	
	if (!server_name) {
		throw new Error('No MCP server specified in route');
	}
	
	let server = alchemy.plugins.thoth.getMcpServer(server_name);
	
	if (!server) {
		throw new Error('MCP server not found: ' + server_name);
	}
	
	return server;
});

/**
 * Get the MCP manager for this request
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Conduit}   conduit
 *
 * @return   {Thoth.Mcp.Manager}
 */
ThothMcp.setMethod(function getManager(conduit) {
	let server = this.getServer(conduit);
	return server.manager;
});

/**
 * Handle POST requests (initialize, tool calls, etc.)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Thoth.Conduit.Mcp}   conduit
 */
ThothMcp.setAction(async function post(conduit) {
	
	try {
		// Get the server and set it on the conduit
		let server = this.getServer(conduit);
		conduit.mcp_server = server;
		
		let manager = server.manager;
		
		// Get body - Alchemy should have parsed it already
		// Try conduit.body first, fall back to reading raw body
		let body = conduit.body;
		
		if (!body || Object.keys(body).length === 0) {
			// Try to get raw body
			body = await conduit.getBody();
		}
		
		if (body === null) {
			conduit.status = 400;
			return conduit.end({
				jsonrpc: '2.0',
				error: {
					code: -32700,
					message: 'Parse error: Invalid JSON',
				},
				id: null,
			});
		}
		
		// Let the manager handle the request
		await manager.handleRequest(conduit, body);
		
	} catch (error) {
		log.error('Error in MCP POST handler:', error);
		
		if (!conduit.response?.headersSent) {
			conduit.status = 500;
			conduit.end({
				jsonrpc: '2.0',
				error: {
					code: -32603,
					message: 'Internal server error',
				},
				id: null,
			});
		}
	}
});

/**
 * Handle GET requests (SSE streams)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Thoth.Conduit.Mcp}   conduit
 */
ThothMcp.setAction(async function get(conduit) {
	
	try {
		// Get the server and set it on the conduit
		let server = this.getServer(conduit);
		conduit.mcp_server = server;
		
		let manager = server.manager;
		
		// GET requests don't have a body
		await manager.handleRequest(conduit, null);
		
	} catch (error) {
		log.error('Error in MCP GET handler:', error);
		
		if (!conduit.response?.headersSent) {
			conduit.status = 500;
			conduit.end({
				jsonrpc: '2.0',
				error: {
					code: -32603,
					message: 'Internal server error',
				},
				id: null,
			});
		}
	}
});

/**
 * Handle DELETE requests (session termination)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Thoth.Conduit.Mcp}   conduit
 */
ThothMcp.setAction(async function delete_(conduit) {
	
	try {
		// Get the server and set it on the conduit
		let server = this.getServer(conduit);
		conduit.mcp_server = server;
		
		let manager = server.manager;
		
		// DELETE requests don't have a body
		await manager.handleRequest(conduit, null);
		
	} catch (error) {
		log.error('Error in MCP DELETE handler:', error);
		
		if (!conduit.response?.headersSent) {
			conduit.status = 500;
			conduit.end({
				jsonrpc: '2.0',
				error: {
					code: -32603,
					message: 'Internal server error',
				},
				id: null,
			});
		}
	}
});

