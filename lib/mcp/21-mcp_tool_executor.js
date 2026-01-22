/**
 * MCP Tool Executor - handles tool execution, auto-calling, and reminders
 *
 * This class encapsulates the tool execution flow:
 * - Parameter validation
 * - Permission checking
 * - Auto-call requirement resolution
 * - Tool execution
 * - Inject reminder processing
 * - Result formatting
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
const ToolExecutor = Function.inherits('Thoth.Mcp.Base', 'Thoth.Mcp', function ToolExecutor(manager, tools) {
	
	// Reference to the parent manager
	this.manager = manager;

	// Reference to the tools Map (from manager)
	this.tools = tools;
});

/**
 * Reference to the parent MCP server (via manager)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
ToolExecutor.setProperty(function server() {
	return this.manager?.server;
});

/**
 * Execute a tool with proper context (main entry point from MCP protocol)
 * 
 * This is the ONLY place where results are finalized to JSON format.
 * All paths (success, error, tool not found) go through here.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string|Object}   tool_or_name   Tool name (string) or tool definition (object)
 * @param    {Object}          params         The parameters from the MCP client
 * @param    {Object}          extra          Extra info from MCP (sessionId, etc.)
 */
ToolExecutor.setMethod(async function executeTool(tool_or_name, params, extra) {
	
	const McpResponse = Classes.Thoth.Mcp.Response;
	const McpError = Classes.Thoth.Mcp.Error;
	
	let response;
	let tool_name;
	
	try {
		// Resolve tool from name if needed
		let tool;
		
		if (typeof tool_or_name === 'string') {
			tool_name = tool_or_name;
			tool = this.tools.get(tool_name);
			
			if (!tool) {
				response = McpResponse.error('Tool not found: ' + tool_name);
				return this.finalizeResponse(response);
			}
		} else {
			tool = tool_or_name;
			tool_name = tool.name;
		}
		
		response = await this._executeTool(tool, params, extra);
	} catch (error) {
		// MCP errors have clean user-facing messages, use them directly
		if (error instanceof McpError) {
			response = McpResponse.error(error.message);
		} else {
			// For unexpected errors, log and prefix with "Error:"
			log.error('Error executing MCP tool', tool_name || 'unknown', error);
			response = McpResponse.error('Error: ' + (error.message || 'Unknown error'));
		}
	}
	
	// Single finalization point - convert to SDK-compatible format
	return this.finalizeResponse(response);
});

/**
 * Internal tool execution logic (called from MCP protocol)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}   tool     The tool definition
 * @param    {Object}   params   The parameters from the MCP client
 * @param    {Object}   extra    Extra info from MCP (sessionId, etc.)
 */
ToolExecutor.setMethod(async function _executeTool(tool, params, extra) {
	
	let conduit = this._setupSessionContext(extra);
	let auto_called = [];
	
	// Set both original_tool (never changes) and current_tool (may change in nested calls)
	if (conduit) {
		conduit.original_tool = tool;
		conduit.current_tool = tool;
	}
	
	// Process auto-triggers before execution
	if (conduit) {
		let triggered = await this.processAutoTriggers(conduit);
		auto_called.push(...triggered);
	}
	
	// Execute the tool (may also add to auto_called via requirements)
	let { result, auto_called: requirement_calls } = await this._executeToolCore(tool, conduit, params);
	auto_called.push(...requirement_calls);
	
	// Process inject reminders after execution
	if (conduit) {
		await this.processInjectReminders(conduit);
	}
	
	return this.formatResult(result, conduit, auto_called);
});

/**
 * Set up the session context from MCP extra data.
 * Updates session activity, links conduit to session, and sets up user data.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}   extra   Extra info from MCP (sessionId, etc.)
 *
 * @return   {Thoth.Conduit.Mcp|null}   The conduit, or null if no session
 */
ToolExecutor.setMethod(function _setupSessionContext(extra) {
	
	let session_id = extra?.sessionId;
	let session = session_id ? this.manager.sessions.get(session_id) : null;
	let conduit = session?.conduit;
	
	if (!session) {
		return null;
	}
	
	// Update last activity time for session timeout tracking
	session.last_activity = Date.now();
	
	// Set up MCP session on the conduit for tracking and injections
	if (conduit) {
		conduit.setMcpSession(session);
		
		// If we have a user, set up the session data on the conduit
		let user = conduit.getMcpUser();
		
		if (user) {
			conduit.session('UserData', user);
			conduit.session('user_id', user.$pk);
		}
	}
	
	return conduit;
});

/**
 * Execute a tool internally (from another tool or auto-call).
 * Returns the raw result (not MCP-formatted). Throws on errors.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Thoth.Conduit.Mcp}   conduit     The MCP conduit
 * @param    {string}              tool_name   The tool name to execute
 * @param    {Object}              params      The parameters
 * @param    {Array}               auto_call_chain   Tools already being auto-called (for cycle detection)
 *
 * @return   {*}   The raw result from the tool
 */
ToolExecutor.setMethod(async function executeToolInternal(conduit, tool_name, params = {}, auto_call_chain = []) {
	
	let tool = this.tools.get(tool_name);
	
	if (!tool) {
		throw new Error(`Tool not found: ${tool_name}`);
	}
	
	// Save the current tool (may be different from original_tool in nested calls)
	let previous_tool = conduit?.current_tool;
	
	// Set current_tool to the tool we're about to execute
	if (conduit) {
		conduit.current_tool = tool;
	}
	
	try {
		let { result } = await this._executeToolCore(tool, conduit, params, auto_call_chain);
		return result;
	} finally {
		// Restore previous current_tool (original_tool stays unchanged)
		if (conduit) {
			conduit.current_tool = previous_tool;
		}
	}
});

/**
 * Core tool execution logic shared between _executeTool and executeToolInternal.
 * Handles parameter validation, permission checking, auto-call resolution, and execution.
 * Throws errors on failure.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}              tool             The tool definition
 * @param    {Thoth.Conduit.Mcp}   conduit          The MCP conduit (may be null)
 * @param    {Object}              params           The parameters
 * @param    {Array}               auto_call_chain  Tools already being auto-called (for cycle detection)
 *
 * @return   {Object}   {result: *, auto_called: Array}
 */
ToolExecutor.setMethod(async function _executeToolCore(tool, conduit, params, auto_call_chain = []) {
	
	// Process and validate parameters through the schema
	let processed_params = params;
	
	if (tool.schema) {
		processed_params = await tool.schema.process(params);
		
		// Process parameter lookups (fetch documents for fields with lookup option)
		await this.processLookups(tool.schema, processed_params, conduit);
	}
	
	// Check permissions if required
	if (tool.permission) {
		const PermissionDeniedError = Classes.Thoth.Mcp.Error.PermissionDenied;
		
		if (!conduit) {
			throw new PermissionDeniedError(tool.permission + ' (no session context)');
		}
		
		if (typeof conduit.hasPermission !== 'function') {
			log.warning('Permission check requested but alchemy-acl not available');
			throw new PermissionDeniedError(tool.permission + ' (permission system unavailable)');
		}
		
		let has_permission = await conduit.hasPermission(tool.permission);
		
		if (!has_permission) {
			throw new PermissionDeniedError(tool.permission);
		}
	}
	
	// Resolve auto-call requirements (may call other tools first)
	let auto_called = [];
	
	if (conduit) {
		let auto_call_result = await this.resolveAutoCallRequirements(conduit, tool, auto_call_chain);
		
		if (auto_call_result.error) {
			throw new Error(auto_call_result.error);
		}
		
		auto_called = auto_call_result.auto_called || [];
		
		// Record the tool call
		conduit.recordToolCall(tool.name);
	}
	
	// Execute the tool (tool.execute calls execute_fn with the tool as context)
	let result = await tool.execute(conduit, processed_params);
	
	return { result, auto_called };
});

/**
 * Process parameter lookups for fields with `lookup` option.
 * Fetches documents from the database and stores them in params.
 *
 * Field options:
 * - lookup: Model name to look up (e.g., 'Employee')
 * - lookup_field: Field to search by (default: parameter name)
 * - lookup_as: Key to store the document (default: lowercase model name)
 * - lookup_required: Whether to throw NotFound error (default: true)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Schema}              schema           The tool's schema
 * @param    {Object}              params           The processed parameters (will be mutated)
 * @param    {Thoth.Conduit.Mcp}   conduit          The MCP conduit (may be null)
 */
ToolExecutor.setMethod(async function processLookups(schema, params, conduit) {
	
	const NotFoundError = Classes.Thoth.Mcp.Error.NotFound;
	
	// Get field names from schema
	let field_names = schema.getFieldNames();
	
	for (let field_name of field_names) {
		let field = schema.getField(field_name);
		let options = field.options;
		
		// Skip if no lookup configured
		if (!options?.lookup) {
			continue;
		}
		
		// Get the parameter value (original string)
		let value = params[field_name];
		
		// Skip if no value provided
		if (value == null || value === '') {
			continue;
		}
		
		// Parse lookup options
		let model_name = options.lookup;
		let lookup_field = options.lookup_field || field_name;
		let lookup_as = options.lookup_as || model_name.toLowerCase();
		let lookup_required = options.lookup_required !== false;
		
		// Get the model class
		let ModelClass = Model.get(model_name, false);
		
		if (!ModelClass) {
			throw new Error(`Model "${model_name}" not found for lookup on parameter "${field_name}"`);
		}
		
		// Use checkPathValue to fetch the document
		// This reuses the same logic as route parameter resolution
		let document = await ModelClass.checkPathValue(
			value,        // The parameter value
			field_name,   // Parameter name (used for rewriting)
			lookup_field, // Field to search by
			conduit       // For permissions/rewriting
		);
		
		// Handle not found
		if (!document) {
			if (lookup_required) {
				throw new NotFoundError(model_name, value);
			}
			// If not required, just skip (don't set lookup_as key)
			continue;
		}
		
		// Store the document at the lookup_as key
		params[lookup_as] = document;
	}
});

/**
 * Resolve requirements for a tool, auto-calling if possible.
 * Handles chaining: if the required tool also has requirements, resolve those first.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Thoth.Conduit.Mcp}   conduit          The MCP conduit
 * @param    {Object}              tool             The tool definition
 * @param    {Array}               auto_call_chain  Tools already being auto-called (for cycle detection)
 *
 * @return   {Object}   {auto_called: [{tool_name, result}], error: string|null}
 */
ToolExecutor.setMethod(async function resolveAutoCallRequirements(conduit, tool, auto_call_chain = []) {
	
	let auto_called = [];
	
	// Determine the effective requirement
	let requirement = null;
	
	if (tool.requires === false) {
		// Tool explicitly opts out of requirements
		requirement = null;
	} else if (tool.requires) {
		// Tool has its own requirement
		requirement = tool.requires;
	} else if (this.server?.requires) {
		// Fall back to server-level default requirement
		requirement = this.server.requires;
	}
	
	if (!requirement) {
		return { auto_called };
	}
	
	// Parse the requirement
	let required_tool_name;
	let requirement_options = null;
	
	if (typeof requirement === 'string') {
		required_tool_name = requirement;
	} else {
		required_tool_name = requirement.tool;
		requirement_options = {
			max_calls_ago: requirement.max_calls_ago,
			max_seconds_ago: requirement.max_seconds_ago,
		};
	}
	
	// Check if the requirement is already met
	let has_called = conduit.hasCalledTool(required_tool_name, requirement_options);
	
	if (has_called) {
		return { auto_called };
	}
	
	// Requirement not met - check if we can auto-call
	let required_tool = this.tools.get(required_tool_name);
	
	if (!required_tool) {
		return {
			auto_called,
			error: `Required tool "${required_tool_name}" not found`,
		};
	}
	
	if (!required_tool.auto_callable) {
		// Build error message
		let error_message = `This tool requires calling "${required_tool_name}" first`;
		
		if (requirement_options?.max_calls_ago != null) {
			error_message += ` (within the last ${requirement_options.max_calls_ago} tool calls)`;
		}
		if (requirement_options?.max_seconds_ago != null) {
			error_message += ` (within the last ${requirement_options.max_seconds_ago} seconds)`;
		}
		
		return { auto_called, error: error_message };
	}
	
	// Check for cycles
	if (auto_call_chain.includes(required_tool_name)) {
		return {
			auto_called,
			error: `Circular auto_call dependency detected: ${auto_call_chain.join(' -> ')} -> ${required_tool_name}`,
		};
	}
	
	// First, resolve the required tool's own requirements (recursive)
	let nested_chain = [...auto_call_chain, required_tool_name];
	let nested_result = await this.resolveAutoCallRequirements(conduit, required_tool, nested_chain);
	
	if (nested_result.error) {
		return nested_result;
	}
	
	// Add nested auto-calls to our list
	auto_called.push(...nested_result.auto_called);
	
	// Record the call first
	conduit.recordToolCall(required_tool_name);
	
	// Set current_tool for the auto-called tool
	let previous_tool = conduit.current_tool;
	conduit.current_tool = required_tool;
	
	try {
		// Execute the tool (with empty params since it has no required params)
		let result = await required_tool.execute(conduit, {});
		
		auto_called.push({
			tool_name: required_tool_name,
			result: result,
		});
		
		return { auto_called };
	} finally {
		// Restore previous current_tool
		conduit.current_tool = previous_tool;
	}
});

/**
 * Check if min_interval constraint is satisfied for a tool.
 * Returns false if we should skip due to throttling.
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {number}              min_interval   Minimum seconds between triggers
 * @param    {string}              tool_name      The tool name
 * @param    {string}              tracker_key    Key prefix for tracking ('reminder' or 'trigger')
 * @param    {Thoth.Conduit.Mcp}   conduit        The MCP conduit
 *
 * @return   {boolean}   True if we can proceed, false if throttled
 */
ToolExecutor.setMethod(function checkMinInterval(min_interval, tool_name, tracker_key, conduit) {
	
	if (min_interval == null) {
		return true;
	}
	
	let last_time = this.getLastTrackedTime(tool_name, tracker_key, conduit);
	
	if (last_time != null) {
		let seconds_since = (Date.now() - last_time) / 1000;
		
		if (seconds_since < min_interval) {
			return false;
		}
	}
	
	return true;
});

/**
 * Check if after_calls/after_seconds conditions are met for a tool.
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}   config        Config with after_calls/after_seconds
 * @param    {string}   tool_name     The tool name
 * @param    {Object}   tool_history  The full tool history
 *
 * @return   {boolean}   True if conditions are met
 */
ToolExecutor.setMethod(function checkCallConditions(config, tool_name, tool_history) {
	
	let tool_entry = tool_history.by_tool[tool_name];
	
	// Check after_calls: trigger if this tool hasn't been called in N calls
	if (config.after_calls != null) {
		if (!tool_entry) {
			// Tool has never been called
			if (tool_history.total_calls >= config.after_calls) {
				return true;
			}
		} else if (tool_entry.calls_since_last >= config.after_calls) {
			return true;
		}
	}
	
	// Check after_seconds: trigger if this tool hasn't been called in N seconds
	if (config.after_seconds != null) {
		if (tool_entry) {
			let seconds_since = (Date.now() - tool_entry.last_called_at) / 1000;
			
			if (seconds_since >= config.after_seconds) {
				return true;
			}
		}
	}
	
	return false;
});

/**
 * Record a tracked timestamp for a tool
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
ToolExecutor.setMethod(function recordTrackedTime(tool_name, tracker_key, conduit) {
	
	let session = conduit?.mcp_session;
	
	if (!session) {
		return;
	}
	
	// Use the session's tracking properties
	if (tracker_key === 'reminder') {
		session.last_reminder_times[tool_name] = Date.now();
	} else if (tracker_key === 'trigger') {
		session.last_trigger_times[tool_name] = Date.now();
	}
});

/**
 * Get the last tracked time for a tool
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
ToolExecutor.setMethod(function getLastTrackedTime(tool_name, tracker_key, conduit) {
	
	let session = conduit?.mcp_session;
	
	if (!session) {
		return null;
	}
	
	// Use the session's tracking properties
	if (tracker_key === 'reminder') {
		return session.last_reminder_times[tool_name] || null;
	} else if (tracker_key === 'trigger') {
		return session.last_trigger_times[tool_name] || null;
	}
	
	return null;
});

/**
 * Process inject_reminder settings for all tools.
 * This runs after each tool call to check if any reminders should be injected.
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Thoth.Conduit.Mcp}   conduit   The MCP conduit
 */
ToolExecutor.setMethod(async function processInjectReminders(conduit) {
	
	let tool_history = conduit.getToolHistory();
	
	for (let [tool_name, tool] of this.tools) {
		let reminder = tool.inject_reminder;
		
		if (!reminder) {
			continue;
		}
		
		try {
			let message = await this.evaluateInjectReminder(reminder, tool_name, conduit, tool_history);
			
			if (message) {
				conduit.queueInjection(message, { type: 'reminder' });
			}
		} catch (err) {
			log.warning('Error evaluating inject_reminder for tool', tool_name, err);
		}
	}
});

/**
 * Evaluate a single inject_reminder setting
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Function|Object}     reminder       The inject_reminder setting
 * @param    {string}              tool_name      The tool this reminder is for
 * @param    {Thoth.Conduit.Mcp}   conduit        The MCP conduit
 * @param    {Object}              tool_history   The full tool history
 *
 * @return   {string|null}   The message to inject, or null
 */
ToolExecutor.setMethod(async function evaluateInjectReminder(reminder, tool_name, conduit, tool_history) {
	
	// If reminder is a function, call it directly (no min_interval support)
	if (typeof reminder === 'function') {
		let result = await reminder(conduit, tool_history);
		
		if (result) {
			this.recordTrackedTime(tool_name, 'reminder', conduit);
		}
		
		return result || null;
	}
	
	// Otherwise it's an object with conditions
	if (typeof reminder !== 'object' || !reminder) {
		return null;
	}
	
	// Check min_interval first (applies to all object forms)
	if (!this.checkMinInterval(reminder.min_interval, tool_name, 'reminder', conduit)) {
		return null;
	}
	
	// If it has a check function, use that
	if (typeof reminder.check === 'function') {
		let result = await reminder.check(conduit, tool_history);
		
		if (result) {
			this.recordTrackedTime(tool_name, 'reminder', conduit);
		}
		
		return result || null;
	}
	
	// Otherwise check after_calls/after_seconds conditions
	if (!this.checkCallConditions(reminder, tool_name, tool_history)) {
		return null;
	}
	
	// Conditions met - evaluate the message (can be string or function)
	let message = reminder.message;
	
	if (typeof message === 'function') {
		message = await message(conduit, tool_history);
	}
	
	if (message) {
		this.recordTrackedTime(tool_name, 'reminder', conduit);
	}
	
	return message || null;
});

/**
 * Process auto_trigger settings for all tools.
 * This runs before tool execution to check if any tools should be auto-triggered.
 * Returns array of {tool_name, result} for triggered tools.
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Thoth.Conduit.Mcp}   conduit   The MCP conduit (with current_tool set)
 *
 * @return   {Array}   Array of {tool_name, result} for auto-triggered tools
 */
ToolExecutor.setMethod(async function processAutoTriggers(conduit) {
	
	let triggered = [];
	let tool_history = conduit.getToolHistory();
	let current_tool = conduit.current_tool;
	
	for (let [tool_name, tool] of this.tools) {
		// Skip the tool being called (don't auto-trigger itself)
		if (current_tool && tool_name === current_tool.name) {
			continue;
		}
		
		// Must have auto_trigger config
		if (!tool.auto_trigger) {
			continue;
		}
		
		// Must be auto_callable (no required params)
		if (!tool.auto_callable) {
			log.warning('Tool', tool_name, 'has auto_trigger but is not auto_callable - skipping');
			continue;
		}
		
		try {
			let should_trigger = await this.evaluateAutoTrigger(
				tool.auto_trigger,
				tool_name,
				conduit,
				tool_history
			);
			
			if (should_trigger) {
				// Record the trigger time
				this.recordTrackedTime(tool_name, 'trigger', conduit);
				
				// Record the tool call
				conduit.recordToolCall(tool_name);
				
				// Set current_tool for the triggered tool
				let previous_tool = conduit.current_tool;
				conduit.current_tool = tool;
				
				try {
					// Execute the tool
					let result = await tool.execute(conduit, {});
					
					triggered.push({
						tool_name: tool_name,
						result: result,
					});
				} finally {
					// Restore previous current_tool
					conduit.current_tool = previous_tool;
				}
			}
		} catch (err) {
			log.warning('Error evaluating/executing auto_trigger for tool', tool_name, err);
		}
	}
	
	return triggered;
});

/**
 * Evaluate a single auto_trigger setting
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Function|Object}     trigger        The auto_trigger setting
 * @param    {string}              tool_name      The tool this trigger is for
 * @param    {Thoth.Conduit.Mcp}   conduit        The MCP conduit (with current_tool set)
 * @param    {Object}              tool_history   The full tool history
 *
 * @return   {boolean}   Whether to trigger
 */
ToolExecutor.setMethod(async function evaluateAutoTrigger(trigger, tool_name, conduit, tool_history) {
	
	// If trigger is a function, call it directly (no min_interval support)
	if (typeof trigger === 'function') {
		return !!(await trigger(conduit, tool_history));
	}
	
	// Otherwise it's an object with conditions
	if (typeof trigger !== 'object' || !trigger) {
		return false;
	}
	
	// Check min_interval first (applies to all object forms)
	if (!this.checkMinInterval(trigger.min_interval, tool_name, 'trigger', conduit)) {
		return false;
	}
	
	// If it has a check function, use that
	if (typeof trigger.check === 'function') {
		return !!(await trigger.check(conduit, tool_history));
	}
	
	// Otherwise check after_calls/after_seconds conditions
	return this.checkCallConditions(trigger, tool_name, tool_history);
});

/**
 * Format a tool result for MCP response.
 * Returns an McpResponse instance (not finalized to JSON yet).
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {*}        result       The result from the tool handler
 * @param    {Thoth.Conduit.Mcp}   conduit      The MCP conduit (optional)
 * @param    {Array}    auto_called  Array of {tool_name, result} for auto-called tools
 *
 * @return   {McpResponse}   The response (not yet finalized)
 */
ToolExecutor.setMethod(function formatResult(result, conduit, auto_called = []) {
	
	const McpResponse = Classes.Thoth.Mcp.Response;
	
	// Convert result to McpResponse
	let response = McpResponse.from(result);
	
	// Prepend auto-called tool outputs
	if (auto_called.length > 0) {
		let prefix = this.formatAutoCalledTools(auto_called);
		response.prependText(prefix);
	}
	
	// Append any queued injections from the conduit
	let injections = conduit?.formatInjections?.();
	
	if (injections) {
		response.appendText(injections);
	}
	
	return response;
});

/**
 * Finalize a response for the MCP SDK.
 * This is the SINGLE place where responses are converted to JSON format.
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {*}   response   McpResponse instance, or any value
 *
 * @return   {Object}   MCP-formatted result object (with content array)
 */
ToolExecutor.setMethod(function finalizeResponse(response) {
	
	const McpResponse = Classes.Thoth.Mcp.Response;
	
	// Ensure we have an McpResponse instance
	if (!(response instanceof McpResponse)) {
		response = McpResponse.from(response);
	}
	
	// Convert to SDK-compatible JSON format
	return response.toJSON();
});

/**
 * Format auto-called tools as XML-style text block
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Array}   auto_called   Array of {tool_name, result}
 *
 * @return   {string}
 */
ToolExecutor.setMethod(function formatAutoCalledTools(auto_called) {
	
	const McpResponse = Classes.Thoth.Mcp.Response;
	
	let parts = ['<auto-called-tools>'];
	
	for (let { tool_name, result } of auto_called) {
		parts.push(`<${tool_name}>`);
		
		// Convert result to text (use toString to ensure _finalize is called)
		let response = McpResponse.from(result);
		let text = response.toString();
		parts.push(text);
		
		parts.push(`</${tool_name}>`);
	}
	
	parts.push('</auto-called-tools>');
	parts.push('');  // Add blank line after
	
	return parts.join('\n');
});
