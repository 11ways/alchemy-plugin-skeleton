var assert = require('assert');
var {
	createMockConduit,
	createMockSession,
	createConduitWithSession,
} = require('./helpers');

describe('MCP Conduit', function() {

	let McpConduit;

	before(function() {
		McpConduit = Classes.Thoth?.Conduit?.Mcp;
		
		if (!McpConduit) {
			throw new Error('Thoth.Conduit.Mcp class not found');
		}
	});

	describe('#initMcpState()', function() {

		it('should initialize mcp_session to null', function() {
			let conduit = createMockConduit();
			assert.strictEqual(conduit.mcp_session, null);
		});

		it('should throw when recordToolCall is called without session', function() {
			let conduit = createMockConduit();
			assert.throws(() => {
				conduit.recordToolCall('test_tool');
			}, /no MCP session available/);
		});

		it('should throw when queueInjection is called without session', function() {
			let conduit = createMockConduit();
			assert.throws(() => {
				conduit.queueInjection('Test message');
			}, /no MCP session available/);
		});
	});

	describe('with session', function() {

		let conduit;

		before(function() {
			conduit = createConduitWithSession();
		});

		describe('#recordToolCall(tool_name)', function() {

			it('should track the first tool call', function() {
				conduit.recordToolCall('test_tool');

				let tool_history = conduit.mcp_session.tool_history;
				assert.strictEqual(tool_history.total_calls, 1);
				assert.strictEqual(tool_history.by_tool['test_tool'].call_count, 1);
				assert.strictEqual(tool_history.by_tool['test_tool'].calls_since_last, 0);
			});

			it('should increment calls_since_last for other tools', function() {
				conduit.recordToolCall('another_tool');

				let tool_history = conduit.mcp_session.tool_history;
				assert.strictEqual(tool_history.total_calls, 2);
				assert.strictEqual(tool_history.by_tool['test_tool'].calls_since_last, 1);
				assert.strictEqual(tool_history.by_tool['another_tool'].calls_since_last, 0);
			});

			it('should reset calls_since_last when tool is called again', function() {
				conduit.recordToolCall('test_tool');

				let tool_history = conduit.mcp_session.tool_history;
				assert.strictEqual(tool_history.total_calls, 3);
				assert.strictEqual(tool_history.by_tool['test_tool'].call_count, 2);
				assert.strictEqual(tool_history.by_tool['test_tool'].calls_since_last, 0);
				assert.strictEqual(tool_history.by_tool['another_tool'].calls_since_last, 1);
			});
		});

		describe('#hasCalledTool(tool_name, options)', function() {

			it('should return true for a called tool', function() {
				assert.strictEqual(conduit.hasCalledTool('test_tool'), true);
			});

			it('should return false for an uncalled tool', function() {
				assert.strictEqual(conduit.hasCalledTool('never_called'), false);
			});

			it('should respect max_calls_ago constraint', function() {
				// another_tool was called 1 call ago
				assert.strictEqual(conduit.hasCalledTool('another_tool', { max_calls_ago: 1 }), true);
				assert.strictEqual(conduit.hasCalledTool('another_tool', { max_calls_ago: 0 }), false);
			});

			it('should respect max_seconds_ago constraint', function() {
				// Tool was called recently, should pass
				assert.strictEqual(conduit.hasCalledTool('test_tool', { max_seconds_ago: 60 }), true);
				
				// Manually set last_called_at to 2 minutes ago
				conduit.mcp_session.tool_history.by_tool['test_tool'].last_called_at = Date.now() - 120000;
				assert.strictEqual(conduit.hasCalledTool('test_tool', { max_seconds_ago: 60 }), false);
			});
		});

		describe('#getToolHistory(tool_name)', function() {

			it('should return specific tool history when name provided', function() {
				let history = conduit.getToolHistory('test_tool');

				assert.strictEqual(history.call_count, 2);
				assert.strictEqual(typeof history.last_called_at, 'number');
			});

			it('should return null for uncalled tool', function() {
				assert.strictEqual(conduit.getToolHistory('never_called'), null);
			});

			it('should return full history when no name provided', function() {
				let history = conduit.getToolHistory();

				assert.strictEqual(history.total_calls, 3);
				assert.ok(history.by_tool['test_tool']);
				assert.ok(history.by_tool['another_tool']);
			});
		});

		describe('#queueInjection(message, options)', function() {

			it('should queue an injection', function() {
				conduit.queueInjection('Test notification');

				let queued = conduit.mcp_session.queued_injections;
				assert.strictEqual(queued.length, 1);
				assert.strictEqual(queued[0].message, 'Test notification');
				assert.strictEqual(queued[0].priority, 'normal');
				assert.strictEqual(queued[0].type, 'notification');
			});

			it('should respect priority option', function() {
				conduit.queueInjection('Urgent!', { priority: 'high' });

				let queued = conduit.mcp_session.queued_injections;
				assert.strictEqual(queued.length, 2);
				assert.strictEqual(queued[1].priority, 'high');
			});

			it('should respect type option', function() {
				conduit.queueInjection('Warning message', { type: 'warning' });

				let queued = conduit.mcp_session.queued_injections;
				assert.strictEqual(queued.length, 3);
				assert.strictEqual(queued[2].type, 'warning');
			});
		});

		describe('#consumeInjections(high_priority_only)', function() {

			it('should return and clear high priority only when requested', function() {
				let high = conduit.consumeInjections(true);

				assert.strictEqual(high.length, 1);
				assert.strictEqual(high[0].message, 'Urgent!');
				assert.strictEqual(conduit.mcp_session.queued_injections.length, 2); // 2 remain
			});

			it('should return and clear all injections', function() {
				let all = conduit.consumeInjections();

				assert.strictEqual(all.length, 2);
				assert.strictEqual(conduit.mcp_session.queued_injections.length, 0);
			});
		});

		describe('#formatInjections()', function() {

			it('should return empty string when no injections', function() {
				assert.strictEqual(conduit.formatInjections(), '');
			});

			it('should format injections with proper prefixes', function() {
				conduit.queueInjection('Normal notification');
				conduit.queueInjection('Warning!', { type: 'warning' });
				conduit.queueInjection('Reminder', { type: 'reminder' });

				let formatted = conduit.formatInjections();

				assert.ok(formatted.includes('[*] Normal notification'));
				assert.ok(formatted.includes('[!] Warning!'));
				assert.ok(formatted.includes('[i] Reminder'));
				assert.ok(formatted.startsWith('\n---'));

				// Should be consumed now
				assert.strictEqual(conduit.mcp_session.queued_injections.length, 0);
			});
		});
	});

	describe('MCP Session Data', function() {

		let session_conduit;

		before(function() {
			session_conduit = createConduitWithSession();
		});

		describe('#setMcpData(key, value)', function() {

			it('should store data in the MCP session', function() {
				session_conduit.setMcpData('project_id', '12345');
				session_conduit.setMcpData('context', { date_range: 'last_week' });

				assert.ok(session_conduit.mcp_session.custom_data);
				assert.strictEqual(session_conduit.mcp_session.custom_data.project_id, '12345');
			});

			it('should throw error when no session', function() {
				let no_session_conduit = createMockConduit();

				assert.throws(() => {
					no_session_conduit.setMcpData('key', 'value');
				}, /no session available/);
			});
		});

		describe('#getMcpData(key, default_value)', function() {

			it('should retrieve stored data', function() {
				let project_id = session_conduit.getMcpData('project_id');
				assert.strictEqual(project_id, '12345');
			});

			it('should return default for missing key', function() {
				let missing = session_conduit.getMcpData('nonexistent', 'default_val');
				assert.strictEqual(missing, 'default_val');
			});

			it('should return undefined for missing key with no default', function() {
				let missing = session_conduit.getMcpData('nonexistent');
				assert.strictEqual(missing, undefined);
			});

			it('should return object data correctly', function() {
				let context = session_conduit.getMcpData('context');
				assert.deepStrictEqual(context, { date_range: 'last_week' });
			});
		});

		describe('#hasMcpData(key)', function() {

			it('should return true for existing key', function() {
				assert.strictEqual(session_conduit.hasMcpData('project_id'), true);
			});

			it('should return false for missing key', function() {
				assert.strictEqual(session_conduit.hasMcpData('nonexistent'), false);
			});
		});

		describe('#deleteMcpData(key)', function() {

			it('should delete existing key and return true', function() {
				session_conduit.setMcpData('to_delete', 'temp');
				assert.strictEqual(session_conduit.hasMcpData('to_delete'), true);

				let result = session_conduit.deleteMcpData('to_delete');
				assert.strictEqual(result, true);
				assert.strictEqual(session_conduit.hasMcpData('to_delete'), false);
			});

			it('should return false for missing key', function() {
				let result = session_conduit.deleteMcpData('never_existed');
				assert.strictEqual(result, false);
			});
		});
	});

	describe('#getApiKey()', function() {

		it('should return null when no API key is set', function() {
			let conduit = createMockConduit();
			assert.strictEqual(conduit.getApiKey(), null);
		});

		it('should return API key from _mcp_api_key', function() {
			let conduit = createMockConduit();
			let mock_api_key = { name: 'test-key', key: 'abc123' };
			conduit._mcp_api_key = mock_api_key;

			assert.strictEqual(conduit.getApiKey(), mock_api_key);
		});

		it('should return API key from mcp_session.api_key', function() {
			let mock_api_key = { name: 'session-key', key: 'xyz789' };
			let conduit = createConduitWithSession({}, { api_key: mock_api_key });

			assert.strictEqual(conduit.getApiKey(), mock_api_key);
		});

		it('should prefer _mcp_api_key over mcp_session.api_key', function() {
			let direct_key = { name: 'direct-key' };
			let session_key = { name: 'session-key' };
			
			let conduit = createConduitWithSession({}, { api_key: session_key });
			conduit._mcp_api_key = direct_key;

			assert.strictEqual(conduit.getApiKey(), direct_key);
		});
	});

	describe('#getHeader()', function() {

		it('should return null for missing header', function() {
			let conduit = createMockConduit();
			assert.strictEqual(conduit.getHeader('x-custom-header'), null);
		});

		it('should return value from request headers', function() {
			let conduit = createMockConduit({
				headers: { 'x-custom-header': 'custom-value' },
			});
			assert.strictEqual(conduit.getHeader('x-custom-header'), 'custom-value');
		});

		it('should be case-insensitive for header names', function() {
			let conduit = createMockConduit({
				headers: { 'x-custom-header': 'lowercase-stored' },
			});
			assert.strictEqual(conduit.getHeader('X-Custom-Header'), 'lowercase-stored');
			assert.strictEqual(conduit.getHeader('X-CUSTOM-HEADER'), 'lowercase-stored');
		});

		it('should fall back to API key default_headers', function() {
			let conduit = createMockConduit();
			conduit._mcp_api_key = {
				default_headers: [
					{ name: 'X-Default-Header', value: 'default-value' },
				],
			};

			assert.strictEqual(conduit.getHeader('x-default-header'), 'default-value');
		});

		it('should prefer request header over API key default', function() {
			let conduit = createMockConduit({
				headers: { 'x-custom-header': 'from-request' },
			});
			conduit._mcp_api_key = {
				default_headers: [
					{ name: 'X-Custom-Header', value: 'from-api-key' },
				],
			};

			assert.strictEqual(conduit.getHeader('x-custom-header'), 'from-request');
		});
	});

	describe('#getHeaderAsBoolean()', function() {

		it('should return false for missing header', function() {
			let conduit = createMockConduit();
			assert.strictEqual(conduit.getHeaderAsBoolean('x-flag'), false);
		});

		it('should return true for "true"', function() {
			let conduit = createMockConduit({ headers: { 'x-flag': 'true' } });
			assert.strictEqual(conduit.getHeaderAsBoolean('x-flag'), true);
		});

		it('should return true for "TRUE" (case-insensitive)', function() {
			let conduit = createMockConduit({ headers: { 'x-flag': 'TRUE' } });
			assert.strictEqual(conduit.getHeaderAsBoolean('x-flag'), true);
		});

		it('should return true for "1"', function() {
			let conduit = createMockConduit({ headers: { 'x-flag': '1' } });
			assert.strictEqual(conduit.getHeaderAsBoolean('x-flag'), true);
		});

		it('should return true for "yes"', function() {
			let conduit = createMockConduit({ headers: { 'x-flag': 'yes' } });
			assert.strictEqual(conduit.getHeaderAsBoolean('x-flag'), true);
		});

		it('should return false for "false"', function() {
			let conduit = createMockConduit({ headers: { 'x-flag': 'false' } });
			assert.strictEqual(conduit.getHeaderAsBoolean('x-flag'), false);
		});

		it('should return false for "0"', function() {
			let conduit = createMockConduit({ headers: { 'x-flag': '0' } });
			assert.strictEqual(conduit.getHeaderAsBoolean('x-flag'), false);
		});

		it('should return false for random string', function() {
			let conduit = createMockConduit({ headers: { 'x-flag': 'something' } });
			assert.strictEqual(conduit.getHeaderAsBoolean('x-flag'), false);
		});

		it('should work with API key default_headers', function() {
			let conduit = createMockConduit();
			conduit._mcp_api_key = {
				default_headers: [
					{ name: 'X-Flag', value: 'true' },
				],
			};

			assert.strictEqual(conduit.getHeaderAsBoolean('x-flag'), true);
		});
	});

	describe('McpSession#restoreToolHistory()', function() {

		it('should restore tool history from plain object', function() {
			let McpSession = Classes.Thoth.Mcp.Session;
			let session = new McpSession();

			session.restoreToolHistory({
				total_calls: 5,
				by_tool: {
					tool_a: { call_count: 3, last_called_at: 1000, calls_since_last: 2 },
					tool_b: { call_count: 2, last_called_at: 2000, calls_since_last: 0 },
				},
			});

			assert.strictEqual(session.tool_history.total_calls, 5);
			
			// Entries should be ToolHistoryEntry instances
			let entry_a = session.tool_history.by_tool['tool_a'];
			assert.ok(entry_a instanceof Classes.Thoth.Mcp.ToolHistoryEntry);
			assert.strictEqual(entry_a.call_count, 3);
			assert.strictEqual(entry_a.last_called_at, 1000);
			assert.strictEqual(entry_a.calls_since_last, 2);

			let entry_b = session.tool_history.by_tool['tool_b'];
			assert.ok(entry_b instanceof Classes.Thoth.Mcp.ToolHistoryEntry);
			assert.strictEqual(entry_b.call_count, 2);
			assert.strictEqual(entry_b.last_called_at, 2000);
			assert.strictEqual(entry_b.calls_since_last, 0);
		});

		it('should handle null/undefined data gracefully', function() {
			let McpSession = Classes.Thoth.Mcp.Session;
			let session = new McpSession();

			// Should not throw
			session.restoreToolHistory(null);
			session.restoreToolHistory(undefined);

			// Should still have default empty state
			assert.strictEqual(session.tool_history.total_calls, 0);
			assert.deepStrictEqual(session.tool_history.by_tool, {});
		});

		it('should handle partial data', function() {
			let McpSession = Classes.Thoth.Mcp.Session;
			let session = new McpSession();

			// Only total_calls, no by_tool
			session.restoreToolHistory({ total_calls: 10 });
			assert.strictEqual(session.tool_history.total_calls, 10);

			// Only by_tool, partial entry data
			session.restoreToolHistory({
				by_tool: {
					tool_x: { call_count: 5 },  // Missing other fields
				},
			});

			let entry = session.tool_history.by_tool['tool_x'];
			assert.strictEqual(entry.call_count, 5);
			// Other fields should be defaults
		});

		it('should work with methods after restoration', function() {
			let McpSession = Classes.Thoth.Mcp.Session;
			let session = new McpSession();

			session.restoreToolHistory({
				total_calls: 2,
				by_tool: {
					init_session: { call_count: 2, last_called_at: Date.now() - 1000, calls_since_last: 1 },
				},
			});

			// Methods should work on restored entries
			assert.strictEqual(session.hasCalledTool('init_session'), true);
			assert.strictEqual(session.hasCalledTool('init_session', { max_calls_ago: 5 }), true);
			assert.strictEqual(session.hasCalledTool('init_session', { max_calls_ago: 0 }), false);
		});
	});
});
