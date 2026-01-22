const THOTH_PLUGIN_GROUP = Plugin.getSettingsGroup();

THOTH_PLUGIN_GROUP.addSetting('endpoint', {
	type        : 'string',
	description : 'The thoth server to use',
	action      : createThothClient,
});

THOTH_PLUGIN_GROUP.addSetting('client', {
	type        : 'string',
	description : 'The client to use as identifier',
	action      : createThothClient,
});

THOTH_PLUGIN_GROUP.addSetting('access_key', {
	type        : 'string',
	description : 'The access key to use when accessing the thoth server',
	action      : createThothClient,
});

THOTH_PLUGIN_GROUP.addSetting('enable_chat', {
	type        : 'boolean',
	description : 'Enable the default chat functionality',
	default     : false,
});

// =============================================================================
// MCP (Model Context Protocol) Server Settings
// =============================================================================

/**
 * MCP servers are configured as an object keyed by server name.
 * Each server can have different tools, auth settings, and paths.
 *
 * @example
 * mcp_servers: {
 *     team: {
 *         path: '/mcp/team',
 *         tool_classes: ['TeamTools'],
 *         require_api_key: true,
 *         requires: 'init_session',
 *     },
 *     public: {
 *         path: '/mcp/public',
 *         tool_names: ['init_session', 'server_info'],
 *         allow_anonymous: true,
 *     }
 * }
 */
THOTH_PLUGIN_GROUP.addSetting('mcp_servers', {
	type        : 'object',
	default     : {},
	description : 'MCP server configurations, keyed by server name',
});

/**
 * Create the main Thoth client
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
function createThothClient() {

	const thoth_settings = alchemy.settings.plugins.thoth;

	let endpoint = thoth_settings.endpoint,
	    client = thoth_settings.client,
	    access_key = thoth_settings.access_key;

	if (!endpoint || !client || !access_key) {
		alchemy.plugins.thoth.client = null;
		alchemy.plugins.thoth.has_thoth = false;
		return;
	}

	alchemy.plugins.thoth.has_thoth = true;

	alchemy.plugins.thoth.client_instance = new Classes.Thoth.Client({
		endpoint    : endpoint,
		client_slug : client,
		access_key  : access_key
	});
};
