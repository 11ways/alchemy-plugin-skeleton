/**
 * Base class for MCP tool collections
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
const McpTools = Function.inherits('Thoth.Mcp.Base', 'Thoth.Mcp', 'Tools');

/**
 * This is an abstract class
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpTools.makeAbstractClass();

/**
 * Store tool definitions per class
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpTools.prepareStaticProperty('tools', function() {
	return new Map();
});

/**
 * Add a tool to this collection.
 * This wraps the registration logic inside constitute().
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}     name        The tool name (snake_case recommended)
 * @param    {Object}     options     Tool options
 * @param    {string}     options.description   Tool description for the LLM
 * @param    {string}     options.permission    Required permission (uses alchemy-acl)
 * @param    {string|Object|false}  options.requires  Tool that must be called first.
 *                                              String: tool name (e.g., 'init_session')
 *                                              Object: {tool, max_calls_ago, max_seconds_ago}
 *                                              false: opt out of server-level requires
 * @param    {boolean}    options.auto_callable  If true, this tool can be automatically called
 *                                              when required by another tool. Only valid for tools
 *                                              with no required parameters.
 * @param    {Function|Object}  options.inject_reminder  Reminder to inject when tool hasn't been called.
 *                                              Function: async (conduit, tool_history) => string|null
 *                                              Object with conditions: {after_calls, after_seconds, message, min_interval}
 *                                              Object with check: {check, min_interval}
 *                                                - after_calls: inject after N calls without this tool
 *                                                - after_seconds: inject after N seconds without this tool
 *                                                - message: string or async (conduit, tool_history) => string|null
 *                                                - check: async (conduit, tool_history) => string|null
 *                                                - min_interval: minimum seconds between reminders for this tool
 * @param    {Function|Object}  options.auto_trigger  Auto-trigger this tool when conditions are met.
 *                                              Function: async (conduit, tool_history) => boolean
 *                                              Object: {after_calls, after_seconds, check, min_interval}
 * @param    {Function}   schemaFn    Function to define the schema. Use `this.addParameter()` to add parameters.
 *                                    Parameter options for lookups:
 *                                      - lookup: Model name to auto-fetch (e.g., 'Employee')
 *                                      - lookup_field: Field to search by (default: parameter name)
 *                                      - lookup_as: Key to store document (default: lowercase model name)
 *                                      - lookup_required: Throw NotFound if missing (default: true)
 * @param    {Function}   executeFn   The tool handler function
 */
McpTools.setStatic(function addTool(name, options, schema_fn, execute_fn) {
	
	this.constitute(function() {
		// Create schema for this tool's parameters
		let schema = alchemy.createSchema();
		
		// Create context for the schema function
		// We provide addParameter as the method name (clearer for tools)
		let schema_context = {
			addParameter: (param_name, type, param_options) => {
				return schema.addField(param_name, type, param_options);
			},
		};
		
		// Let the schema function populate the schema
		schema_fn.call(schema_context);

		options.execute_fn = execute_fn;
		options.schema = schema;
		
		// Create an McpTool instance
		let tool = new Classes.Thoth.Mcp.Tool(this, name, options);
		
		// Store the tool instance
		this.tools.set(name, tool);
	});
});

/**
 * Get all tools from this class and its parents
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {Map}   Map of tool name -> tool definition
 */
McpTools.setStatic(function getAllTools() {
	
	let all_tools = new Map();
	let current = this;
	
	// Walk up the inheritance chain
	while (current && current.tools instanceof Map) {
		for (let [name, tool] of current.tools) {
			// Don't override if already set (child class takes precedence)
			if (!all_tools.has(name)) {
				all_tools.set(name, tool);
			}
		}
		
		// Move to parent class
		current = Object.getPrototypeOf(current);
		
		// Stop at McpTools itself
		if (current === McpTools) {
			break;
		}
	}
	
	return all_tools;
});


