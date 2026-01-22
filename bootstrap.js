/**
 * Thoth plugin bootstrap
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */

/**
 * Store for all registered MCP servers
 */
Plugin.mcp_servers = new Map();

/**
 * Create and register an MCP server
 *
 * @param    {Object}   options
 * @param    {string}   options.name              Server identifier (required)
 * @param    {string}   options.path              URL path to mount on
 * @param    {boolean}  options.require_api_key   Require API key auth
 * @param    {boolean}  options.allow_anonymous   Allow anonymous access
 * @param    {number}   options.session_timeout   Session timeout in ms
 * @param    {Array}    options.tool_classes      Tool class names to include
 * @param    {Array}    options.tool_names        Specific tool names to include
 * @param    {boolean}  options.include_core_tools Include core tools always
 *
 * @return   {Thoth.Mcp.Server}
 */
Plugin.createMcpServer = function createMcpServer(options) {

	if (!options?.name) {
		throw new Error('MCP server requires a name');
	}
	
	if (this.mcp_servers.has(options.name)) {
		throw new Error('MCP server with name "' + options.name + '" already exists');
	}
	
	let server = new Classes.Thoth.Mcp.Server(options.name, options);

	this.mcp_servers.set(options.name, server);
	
	return server;
};

/**
 * Get an MCP server by name
 *
 * @param    {string}   name
 *
 * @return   {Thoth.Mcp.Server|null}
 */
Plugin.getMcpServer = function getMcpServer(name) {
	return this.mcp_servers.get(name) || null;
};

/**
 * Get all registered MCP servers
 *
 * @return   {Map<string, Thoth.Mcp.Server>}
 */
Plugin.getAllMcpServers = function getAllMcpServers() {
	return this.mcp_servers;
};

// =============================================================================
// Create MCP servers from configuration
// =============================================================================

STAGES.getStage('routes').addPostTask(async () => {
	
	// Set up MCP devmode endpoints if ai-devmode is enabled
	if (alchemy.ai_devmode_enabled) {
		require('./scripts/setup_mcp_devmode.js')();
	}
	
	// Get MCP server config - check plugin default_settings first, then alchemy settings
	let plugin = alchemy.plugins.thoth;
	let mcp_servers_config = plugin?.default_settings?.mcp_servers;
	
	// If not found in default_settings, try the settings system
	if (!mcp_servers_config) {
		mcp_servers_config = alchemy.getSetting('plugins.thoth.mcp_servers');
	}
	
	if (!mcp_servers_config || Object.keys(mcp_servers_config).length === 0) {
		log.info('MCP bootstrap: No MCP servers configured');
		return;
	}
	
	log.info('MCP bootstrap: Found', Object.keys(mcp_servers_config).length, 'servers to create');
	
	for (let [name, config] of Object.entries(mcp_servers_config)) {
		try {
			log.info('MCP bootstrap: Creating server:', name, 'with config:', config);
			
			// Add name to config if not present
			config.name = name;
			
			// Create the server
			let server = Plugin.createMcpServer(config);
			
			// Create routes
			server.createRoutes();
			
			// Initialize the server
			await server.initialize();
			
			log.info('MCP bootstrap: Created MCP server:', name, 'at path:', server.path);
		} catch (err) {
			log.error('MCP bootstrap: Failed to create MCP server "' + name + '":', err);
		}
	}
});
