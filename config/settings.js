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
