/**
 * Test MCP Tools - used for testing the alchemy-thoth plugin
 * 
 * These tools are loaded only during tests, not in production.
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
const TestTools = Function.inherits('Thoth.Mcp.Tools', 'TestTools');

/**
 * Simple echo tool - returns what you send
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
TestTools.addTool('echo', {
	description: 'Echo back the provided message',
}, function schema() {
	this.addParameter('message', 'String', {
		required        : true,
		mcp_description : 'The message to echo back',
	});
}, async function execute(conduit, params) {
	return {
		echoed: params.message,
		timestamp: new Date().toISOString(),
	};
});

/**
 * Calculator tool - performs basic math operations
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
TestTools.addTool('calculate', {
	description: 'Perform basic math operations',
}, function schema() {
	this.addParameter('operation', 'Enum', {
		required : true,
		values   : {
			add      : 'Addition',
			subtract : 'Subtraction',
			multiply : 'Multiplication',
			divide   : 'Division',
		},
		mcp_description: 'The math operation to perform',
	});
	this.addParameter('a', 'Number', {
		required        : true,
		mcp_description : 'First operand',
	});
	this.addParameter('b', 'Number', {
		required        : true,
		mcp_description : 'Second operand',
	});
}, async function execute(conduit, params) {
	
	let result;
	
	switch (params.operation) {
		case 'add':
			result = params.a + params.b;
			break;
		case 'subtract':
			result = params.a - params.b;
			break;
		case 'multiply':
			result = params.a * params.b;
			break;
		case 'divide':
			if (params.b === 0) {
				return this.createResponse()
					.line('Division by zero is not allowed')
					.asError();
			}
			result = params.a / params.b;
			break;
		default:
			return this.createResponse()
				.line(`Unknown operation: ${params.operation}`)
				.asError();
	}
	
	return {
		operation : params.operation,
		a         : params.a,
		b         : params.b,
		result    : result,
	};
});

/**
 * Get server info tool - returns information about the Alchemy server
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
TestTools.addTool('server_info', {
	description: 'Get information about the Alchemy server',
}, function schema() {
	// No parameters needed
}, async function execute(conduit, params) {
	return {
		name       : alchemy.settings.name || 'Unknown',
		version    : alchemy.settings.version || 'Unknown',
		environment: alchemy.settings.environment || 'development',
		uptime     : process.uptime(),
		node_version: process.version,
	};
});

/**
 * Formatted server info - demonstrates McpResponse builder pattern
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
TestTools.addTool('formatted_info', {
	description: 'Get formatted server info (demonstrates McpResponse builder)',
}, function schema() {
	this.addParameter('include_memory', 'Boolean', {
		default         : false,
		mcp_description : 'Include memory usage information',
	});
}, async function execute(conduit, params) {
	
	let response = this.createResponse()
		.header('Server Information')
		.line(`Name: ${alchemy.settings.name || 'Unknown'}`)
		.line(`Environment: ${alchemy.settings.environment || 'development'}`)
		.line(`Node: ${process.version}`)
		.blank();
	
	if (params.include_memory) {
		let mem = process.memoryUsage();
		let mb = (bytes) => Math.round(bytes / 1024 / 1024) + ' MB';
		
		response.subheader('Memory Usage')
			.bullet(`Heap Used: ${mb(mem.heapUsed)}`)
			.bullet(`Heap Total: ${mb(mem.heapTotal)}`)
			.bullet(`RSS: ${mb(mem.rss)}`)
			.blank();
	}
	
	response.summary(`Uptime: ${Math.round(process.uptime())} seconds`);
	
	return response;
});

/**
 * List available tools - returns all registered MCP tools
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
TestTools.addTool('list_tools', {
	description: 'List all available MCP tools',
}, function schema() {
	this.addParameter('include_permissions', 'Boolean', {
		default         : false,
		mcp_description : 'Include permission requirements in the output',
	});
}, async function execute(conduit, params) {
	
	let McpTools = Classes.Thoth.Mcp.Tools;
	let tools_list = [];
	
	if (!McpTools) {
		return { tools: [] };
	}
	
	let tool_classes = McpTools.getDescendants();
	
	for (let ToolClass of tool_classes) {
		if (ToolClass.is_abstract_class) {
			continue;
		}
		
		let tools = ToolClass.getAllTools();
		
		for (let [name, tool] of tools) {
			let tool_info = {
				name        : name,
				description : tool.description,
				class       : tool.class_name,
			};
			
			if (params.include_permissions && tool.permission) {
				tool_info.permission = tool.permission;
			}
			
			tools_list.push(tool_info);
		}
	}
	
	return {
		tools: tools_list,
		count: tools_list.length,
	};
});

/**
 * Protected tool example - requires permission
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
TestTools.addTool('admin_info', {
	description : 'Get admin information (requires admin permission)',
	permission  : 'thoth.admin',
}, function schema() {
	// No parameters needed
}, async function execute(conduit, params) {
	
	// This tool requires 'thoth.admin' permission
	// The MCP Manager will check this before execution
	
	// Count sessions across all MCP servers
	let sessions_count = 0;
	let mcp_servers = alchemy.plugins.thoth?.mcp_servers;
	
	if (mcp_servers) {
		for (let server of mcp_servers.values()) {
			sessions_count += server.manager?.sessions?.size || 0;
		}
	}
	
	return {
		message        : 'You have admin access!',
		sessions_count : sessions_count,
	};
});

/**
 * Example initialization tool - demonstrates how apps can create their own
 * session initialization that other tools can require.
 * 
 * Apps should create their own initialization tools with domain-specific
 * context. This is just an example.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
TestTools.addTool('init_session', {
	description   : 'Initialize session context. Call this first to set up the session.',
	requires      : false,  // This tool opts out of any server-level requires
	auto_callable : true,   // Can be auto-called when required by another tool
}, function schema() {
	// No parameters needed
}, async function execute(conduit, params) {
	
	let now = new Date();
	
	return this.createResponse()
		.line('Session initialized')
		.line(`Timestamp: ${now.toISOString()}`)
		.line(`Date: ${now.toLocaleDateString()}`)
		.line(`Time: ${now.toLocaleTimeString()}`);
});

/**
 * Guarded tool example - requires init_session to be called first
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
TestTools.addTool('guarded_echo', {
	description : 'Echo back a message (requires init_session to be called first)',
	requires    : 'init_session',
}, function schema() {
	this.addParameter('message', 'String', {
		required        : true,
		mcp_description : 'The message to echo back',
	});
}, async function execute(conduit, params) {
	return {
		guarded_echo : params.message,
		message      : 'This tool required init_session!',
	};
});
