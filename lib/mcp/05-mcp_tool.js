/**
 * MCP Tool class - represents a single tool
 * 
 * This class holds all the configuration for a single tool and provides
 * the execution context. When tool execute functions run, `this` refers
 * to the McpTool instance, providing access to:
 * - this.createResponse() - Create a response builder
 * - this.name - The tool name
 * - this.description - The tool description
 * - this.schema - The parameter schema
 * - this.tools_class - The parent tools collection class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
const McpTool = Function.inherits('Thoth.Mcp.Base', 'Thoth.Mcp', function Tool(tools, name, options) {

	this.name = name;

	// The tool description (shown to the LLM)
	this.description = options.description || '';

	// Required permission (uses alchemy-acl)
	this.permission = options.permission || null;

	// Tool that must be called first
	// String: tool name (e.g., 'init_session')
	// Object: {tool, max_calls_ago, max_seconds_ago}
	// false: opt out of server-level requires
	this.requires = options.requires ?? null;

	// If true, this tool can be automatically called when required by another tool.
	// Only valid for tools with no required parameters.
	this.auto_callable = options.auto_callable || false;

	// Reminder to inject when tool hasn't been called.
	// Function: async (conduit, tool_history) => string|null
	// Object: {after_calls, after_seconds, message, min_interval, check}
	this.inject_reminder = options.inject_reminder || null;

	// Auto-trigger this tool when conditions are met.
	// Function: async (conduit, tool_history) => boolean
	// Object: {after_calls, after_seconds, check, min_interval}
	this.auto_trigger = options.auto_trigger || null;

	// The parameter schema (Alchemy Schema)
	this.schema = options.schema;

	// The execute function provided by the user
	this.execute_fn = options.execute_fn;

	// Reference to the parent tools collection class (e.g., SessionTools)
	this.tools_class = tools;
});

/**
 * Get the class name of the tools collection (for backwards compatibility)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpTool.setProperty(function class_name() {
	return this.tools_class?.name || null;
});

/**
 * Execute the tool.
 * Calls the user-provided function with this McpTool instance as context.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Thoth.Conduit.Mcp}   conduit   The MCP conduit
 * @param    {Object}              params    The processed parameters
 *
 * @return   {*}   The result from the execute function
 */
McpTool.setMethod(async function execute(conduit, params) {
	return this.execute_fn.call(this, conduit, params);
});

/**
 * Create a new McpResponse builder.
 * Convenience method for use in tool execute functions.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {McpResponse}
 */
McpTool.setMethod(function createResponse() {
	return Classes.Thoth.Mcp.Response.create();
});

/**
 * Guard a download URL against local-file / SSRF access.
 *
 * Unless the `allow_local_file_access` plugin setting is enabled, only http(s)
 * URLs to non-private hosts are permitted. This blocks `file://`, bare paths
 * and private/loopback targets so that an LLM with MCP access cannot make the
 * server read arbitrary local files or reach internal services.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.2
 *
 * @param    {string}   url
 *
 * @return   {string}   The trimmed, validated URL
 */
McpTool.setMethod(function assertDownloadAllowed(url) {

	const McpError = Classes.Thoth.Mcp.Error;

	let value = String(url || '').trim();

	if (!value) {
		throw new McpError('No URL provided');
	}

	let allow_local = alchemy.settings?.plugins?.thoth?.allow_local_file_access;

	if (allow_local) {
		return value;
	}

	let parsed;

	try {
		parsed = new URL(value);
	} catch (err) {
		throw new McpError('Invalid URL: ' + value);
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new McpError('Only http(s) URLs are allowed (got "' + parsed.protocol + '"). Local file access is disabled.');
	}

	if (isPrivateHost(parsed.hostname)) {
		throw new McpError('Refusing to download from a local/private host. Local file access is disabled.');
	}

	return value;
});

/**
 * Check whether a hostname points at a loopback or private-network address.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.2
 *
 * @param    {string}   hostname
 *
 * @return   {boolean}
 */
function isPrivateHost(hostname) {

	if (!hostname) {
		return true;
	}

	let host = hostname.toLowerCase();

	// Strip IPv6 brackets
	if (host[0] === '[') {
		host = host.slice(1, -1);
	}

	if (host === 'localhost' || host.endsWith('.localhost')) {
		return true;
	}

	// IPv6 loopback / link-local / unique-local
	if (host === '::1' || host === '::' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
		return true;
	}

	// IPv4 ranges
	let m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

	if (m) {
		let a = +m[1], b = +m[2];

		if (a === 127 || a === 10 || a === 0) return true;            // loopback / private / this-host
		if (a === 169 && b === 254) return true;                      // link-local
		if (a === 192 && b === 168) return true;                      // private
		if (a === 172 && b >= 16 && b <= 31) return true;             // private
	}

	return false;
}
