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
