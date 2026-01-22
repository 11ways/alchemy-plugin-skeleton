/**
 * MCP Server - represents a single isolated MCP endpoint
 *
 * Multiple MCP servers can exist in a single Alchemy application,
 * each with its own configuration, tools, and sessions.
 *
 * @example
 * // Via plugin configuration (declarative):
 * alchemy.usePlugin('thoth', {
 *     mcp_servers: {
 *         team: {
 *             path: '/mcp/team',
 *             tool_classes: ['TeamTools'],
 *             requires: 'initialize_session',  // All tools require this first
 *             require_api_key: true,
 *         }
 *     }
 * });
 *
 * // Via runtime creation (programmatic):
 * alchemy.plugins.thoth.createMcpServer({
 *     name: 'team',
 *     path: '/mcp/team',
 *     tool_classes: ['TeamTools'],
 * });
 *
 * @constructor
 * 
 * @param    {string}   name              Server identifier
 * @param    {Object}   options
 * @param    {string}   options.path              URL path to mount on
 * @param    {boolean}  options.require_api_key   Require API key auth
 * @param    {boolean}  options.allow_anonymous   Allow anonymous access
 * @param    {number}   options.session_timeout   Session timeout in ms
 * @param    {Array}    options.tool_classes      Tool class names to include
 * @param    {Array}    options.tool_names        Specific tool names to include
 * @param    {string|Object} options.requires     Default tool requirement for all tools
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
const McpServer = Function.inherits('Thoth.Mcp.Base', 'Thoth.Mcp', function Server(name, options) {

	// The manager instance for this server
	this.manager = new Classes.Thoth.Mcp.Manager(this);

	// The unique name of this server (used for identification)
	this.name = name;
	
	// The URL path where this MCP server is mounted
	this.path = options.path ?? '/mcp';

	// Whether API key authentication is required
	this.require_api_key = options.require_api_key ?? true;

	// Whether anonymous connections are allowed
	this.allow_anonymous = options.allow_anonymous ?? false;

	// Session timeout in milliseconds
	this.session_timeout = options.session_timeout ?? 3600000;

	// Tool class names to include (e.g., ['CoreTools', 'TeamTools'])
	this.tool_classes = options.tool_classes;

	// Specific tool names to include (e.g., ['init_session', 'echo'])
	this.tool_names = options.tool_names;

	// Default tool requirement for all tools on this server
	// Tools can override with their own `requires` or set `requires: false` to opt out
	// Can be a string (tool name) or object with options:
	// - { tool: 'init_session', max_calls_ago: 10 }
	this.requires = options.requires;
});

/**
 * Create and register the routes for this MCP server
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpServer.setMethod(function createRoutes() {
	
	let path = this.path;
	let server_name = this.name;
	
	// POST - Initialize and tool calls
	// Use separate 'name' and 'handler' - name is for URL lookup, handler is for controller#action
	let post_route = {
		name          : 'Mcp@' + server_name + '#post',
		handler       : 'ThothMcp#post',
		methods       : 'post',
		paths         : path,
		conduit_class : 'Thoth.Conduit.Mcp',
		mcp_server    : server_name,
	};
	Router.add(post_route);
	
	// GET - SSE streams
	Router.add({
		name          : 'Mcp@' + server_name + '#get',
		handler       : 'ThothMcp#get',
		methods       : 'get',
		paths         : path,
		conduit_class : 'Thoth.Conduit.Mcp',
		mcp_server    : server_name,
	});
	
	// DELETE - Session termination
	Router.add({
		name          : 'Mcp@' + server_name + '#delete',
		handler       : 'ThothMcp#delete_',
		methods       : 'delete',
		paths         : path,
		conduit_class : 'Thoth.Conduit.Mcp',
		mcp_server    : server_name,
	});
	
	// OPTIONS - CORS preflight
	Router.add({
		name          : 'Mcp@' + server_name + '#options',
		handler       : 'ThothMcp#options',
		methods       : 'options',
		paths         : path,
		conduit_class : 'Thoth.Conduit.Mcp',
		mcp_server    : server_name,
	});
});

/**
 * Initialize this server
 * Called after routes are created
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpServer.setMethod(async function initialize() {
	await this.manager.initialize();
});
