const assert = require('assert');

describe('Thoth.Mcp.Error', function() {

	describe('Base McpError', function() {
		let McpError;

		before(function() {
			McpError = Classes.Thoth.Mcp.Error;
		});

		it('should be an instance of Alchemy.Error', function() {
			let error = new McpError('Test error');
			assert.ok(error instanceof Error);
			assert.ok(error instanceof Classes.Alchemy.Error);
		});

		it('should have default code MCP_ERROR', function() {
			let error = new McpError('Test error');
			assert.strictEqual(error.code, 'MCP_ERROR');
		});

		it('should include code in toString()', function() {
			let error = new McpError('Something went wrong');
			let str = error.toString();
			assert.ok(str.includes('[MCP_ERROR]'));
			assert.ok(str.includes('Something went wrong'));
		});

		it('should serialize code and message', function() {
			let error = new McpError('Test error');
			let props = error.properties_to_serialize;
			assert.ok(props.includes('code'));
			assert.ok(props.includes('message'));
		});
	});

	describe('NotFound Error', function() {
		let NotFound;

		before(function() {
			NotFound = Classes.Thoth.Mcp.Error.NotFound;
		});

		it('should be an instance of McpError', function() {
			let error = new NotFound('Employee', 'john-doe');
			assert.ok(error instanceof Classes.Thoth.Mcp.Error);
		});

		it('should have code NOT_FOUND', function() {
			let error = new NotFound('Employee', 'john-doe');
			assert.strictEqual(error.code, 'NOT_FOUND');
		});

		it('should format message with entity and identifier', function() {
			let error = new NotFound('Employee', 'john-doe');
			assert.strictEqual(error.message, 'Employee "john-doe" not found');
		});

		it('should store entity and identifier', function() {
			let error = new NotFound('Project', 'my-project');
			assert.strictEqual(error.entity, 'Project');
			assert.strictEqual(error.identifier, 'my-project');
		});

		it('should serialize entity and identifier', function() {
			let error = new NotFound('Task', 'task-123');
			let props = error.properties_to_serialize;
			assert.ok(props.includes('entity'));
			assert.ok(props.includes('identifier'));
		});
	});

	describe('PermissionDenied Error', function() {
		let PermissionDenied;

		before(function() {
			PermissionDenied = Classes.Thoth.Mcp.Error.PermissionDenied;
		});

		it('should be an instance of McpError', function() {
			let error = new PermissionDenied('admin.edit');
			assert.ok(error instanceof Classes.Thoth.Mcp.Error);
		});

		it('should have code PERMISSION_DENIED', function() {
			let error = new PermissionDenied('admin.edit');
			assert.strictEqual(error.code, 'PERMISSION_DENIED');
		});

		it('should format message with permission', function() {
			let error = new PermissionDenied('thoth.admin');
			assert.strictEqual(error.message, 'Permission denied: thoth.admin');
		});

		it('should store permission', function() {
			let error = new PermissionDenied('user.delete');
			assert.strictEqual(error.permission, 'user.delete');
		});

		it('should serialize permission', function() {
			let error = new PermissionDenied('some.permission');
			let props = error.properties_to_serialize;
			assert.ok(props.includes('permission'));
		});
	});

	describe('Error handling in ToolExecutor', function() {
		let McpResponse;

		before(function() {
			McpResponse = Classes.Thoth.Mcp.Response;
		});

		it('should convert NotFound error to error response without double "Error:" prefix', async function() {
			// Create an MCP server for testing
			let server = alchemy.plugins.thoth.getMcpServer('test');
			assert.ok(server, 'Test server should exist');

			// Get the tool executor
			let executor = server.manager.tool_executor;

			// Create a mock tool that throws NotFound
			let mock_tool = {
				name: 'mock_throw_not_found',
				execute: async () => {
					throw new Classes.Thoth.Mcp.Error.NotFound('Employee', 'unknown-slug');
				}
			};

			// Execute and check the response
			let result = await executor.executeTool(mock_tool, {}, {});

			assert.ok(result.isError, 'Response should be an error');
			assert.ok(result.content, 'Response should have content');

			// Should NOT have internal is_error property (only isError for MCP spec)
			assert.strictEqual(result.is_error, undefined, 'Should not have internal is_error property');

			// Get the error message
			let text = result.content.find(c => c.type === 'text')?.text;
			assert.ok(text, 'Response should have text content');

			// Should NOT have double "Error: Error:" prefix
			assert.ok(!text.startsWith('Error:'), 'NotFound error should not have "Error:" prefix');
			assert.strictEqual(text, 'Employee "unknown-slug" not found');
		});

		it('should prefix generic errors with "Error:"', async function() {
			let server = alchemy.plugins.thoth.getMcpServer('test');
			let executor = server.manager.tool_executor;

			let mock_tool = {
				name: 'mock_throw_generic',
				execute: async () => {
					throw new Error('Something unexpected happened');
				}
			};

			let result = await executor.executeTool(mock_tool, {}, {});

			assert.ok(result.isError, 'Response should be an error');
			assert.strictEqual(result.is_error, undefined, 'Should not have internal is_error property');
			
			let text = result.content.find(c => c.type === 'text')?.text;
			assert.ok(text.startsWith('Error:'), 'Generic error should have "Error:" prefix');
			assert.ok(text.includes('Something unexpected happened'));
		});

		it('should convert PermissionDenied error to error response without "Error:" prefix', async function() {
			let server = alchemy.plugins.thoth.getMcpServer('test');
			let executor = server.manager.tool_executor;

			let mock_tool = {
				name: 'mock_throw_permission',
				execute: async () => {
					throw new Classes.Thoth.Mcp.Error.PermissionDenied('admin.access');
				}
			};

			let result = await executor.executeTool(mock_tool, {}, {});

			assert.ok(result.isError, 'Response should be an error');
			
			let text = result.content.find(c => c.type === 'text')?.text;
			assert.ok(!text.startsWith('Error: Error:'), 'Should not have double Error: prefix');
			assert.strictEqual(text, 'Permission denied: admin.access');
		});
	});
});
