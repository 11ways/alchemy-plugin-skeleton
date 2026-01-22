var assert = require('assert');
var {
	createMockConduit,
	createMockSession,
	createConduitWithSession,
	registerTestSession,
} = require('./helpers');

describe('MCP Manager', function() {

	let McpManager;
	let McpTools;
	let manager;

	before(function() {
		McpManager = Classes.Thoth?.Mcp?.Manager;
		McpTools = Classes.Thoth?.Mcp?.Tools;

		if (!McpManager) {
			throw new Error('Thoth.Mcp.Manager class not found');
		}
	});

	describe('Tool Discovery', function() {

		it('should have discovered example tools', async function() {
			manager = new McpManager();
			await manager.discoverAllTools();

			assert.ok(manager.tools.has('echo'), 'echo tool should exist');
			assert.ok(manager.tools.has('calculate'), 'calculate tool should exist');
			assert.ok(manager.tools.has('init_session'), 'init_session tool should exist');
		});
	});

	describe('Tool Definition', function() {

		it('should store requires option', function() {
			let TestTools = Function.inherits('Thoth.Mcp.Tools', 'TestToolsRequires');

			TestTools.addTool('guarded_tool', {
				description: 'A tool that requires init_session',
				requires: 'init_session',
			}, function schema() {
				// No params
			}, async function execute(conduit, params) {
				return 'success';
			});
		});

		it('should support complex requires option', function() {
			let TestTools = Classes.Thoth.Mcp.TestToolsRequires;

			TestTools.addTool('complex_guarded_tool', {
				description: 'A tool with complex requirements',
				requires: {
					tool: 'init_session',
					max_calls_ago: 10,
					max_seconds_ago: 300,
				},
			}, function schema() {
				// No params
			}, async function execute(conduit, params) {
				return 'success';
			});
		});
	});

	describe('#executeTool() with requires', function() {

		before(function() {
			// Clear tools to refresh discovery
			manager.tools.clear();
		});

		it('should block tool when requirement not met (non-auto_callable)', async function() {
			// Register a non-auto_callable required tool
			manager.tools.set('manual_setup', {
				name: 'manual_setup',
				description: 'A setup tool that must be called manually',
				auto_callable: false,
				schema: null,
				execute: async () => 'setup complete',
			});

			manager.tools.set('test_guarded', {
				name: 'test_guarded',
				description: 'Test guarded tool',
				requires: 'manual_setup',  // requires a non-auto_callable tool
				schema: null,
				execute: async () => 'success',
			});

			let conduit = createMockConduit();
			let session_id = 'test-session-123';
			let session = createMockSession();
			
			registerTestSession(manager, session_id, session, conduit);

			let result = await manager.executeTool(
				manager.tools.get('test_guarded'),
				{},
				{ sessionId: session_id }
			);

			assert.strictEqual(result.isError, true);
			assert.ok(result.content[0].text.includes('requires calling "manual_setup" first'));
		});

		it('should allow tool when requirement is met', async function() {
			let conduit = createMockConduit();
			let session_id = 'test-session-456';
			let session = createMockSession();
			
			registerTestSession(manager, session_id, session, conduit);

			// Record that manual_setup was called
			conduit.recordToolCall('manual_setup');

			let result = await manager.executeTool(
				manager.tools.get('test_guarded'),
				{},
				{ sessionId: session_id }
			);

			assert.strictEqual(result.isError, undefined);
			assert.strictEqual(result.content[0].text, 'success');
		});

		it('should auto-call when requirement is auto_callable', async function() {
			// Register an auto_callable required tool
			manager.tools.set('auto_setup', {
				name: 'auto_setup',
				description: 'A setup tool that can be auto-called',
				auto_callable: true,
				schema: null,
				execute: async () => ({ initialized: true, timestamp: 'now' }),
			});

			manager.tools.set('needs_auto_setup', {
				name: 'needs_auto_setup',
				description: 'Tool that requires auto_setup',
				requires: 'auto_setup',
				schema: null,
				execute: async () => 'main result',
			});

			let conduit = createMockConduit();
			let session_id = 'test-session-auto';
			let session = createMockSession();
			
			registerTestSession(manager, session_id, session, conduit);

			let result = await manager.executeTool(
				manager.tools.get('needs_auto_setup'),
				{},
				{ sessionId: session_id }
			);

			// Should succeed (no error)
			assert.strictEqual(result.isError, undefined);
			// Should include auto-call output prepended
			assert.ok(result.content[0].text.includes('<auto-called-tools>'));
			assert.ok(result.content[0].text.includes('auto_setup'));
			assert.ok(result.content[0].text.includes('initialized'));
			// Should include main result
			assert.ok(result.content[0].text.includes('main result'));
			// auto_setup should be recorded in history
			assert.ok(conduit.hasCalledTool('auto_setup'));
		});

		it('should chain auto-calls when requirements have requirements', async function() {
			// A -> B -> C chain where B and C are auto_callable
			manager.tools.set('chain_c', {
				name: 'chain_c',
				description: 'Base of the chain',
				auto_callable: true,
				requires: false,
				schema: null,
				execute: async () => 'C executed',
			});

			manager.tools.set('chain_b', {
				name: 'chain_b',
				description: 'Middle of the chain',
				auto_callable: true,
				requires: 'chain_c',
				schema: null,
				execute: async () => 'B executed',
			});

			manager.tools.set('chain_a', {
				name: 'chain_a',
				description: 'Top of the chain',
				requires: 'chain_b',
				schema: null,
				execute: async () => 'A executed',
			});

			let conduit = createMockConduit();
			let session_id = 'test-session-chain';
			let session = createMockSession();
			
			registerTestSession(manager, session_id, session, conduit);

			let result = await manager.executeTool(
				manager.tools.get('chain_a'),
				{},
				{ sessionId: session_id }
			);

			// Should succeed
			assert.strictEqual(result.isError, undefined);
			// Should include both auto-called tools in order
			let text = result.content[0].text;
			assert.ok(text.includes('chain_c'), 'Should include chain_c output');
			assert.ok(text.includes('chain_b'), 'Should include chain_b output');
			assert.ok(text.includes('A executed'), 'Should include main result');
			// All tools should be in history
			assert.ok(conduit.hasCalledTool('chain_c'));
			assert.ok(conduit.hasCalledTool('chain_b'));
			assert.ok(conduit.hasCalledTool('chain_a'));
		});

		it('should block when max_calls_ago exceeded (non-auto_callable)', async function() {
			manager.tools.set('test_calls_ago', {
				name: 'test_calls_ago',
				description: 'Test max_calls_ago',
				requires: {
					tool: 'manual_setup',  // non-auto_callable
					max_calls_ago: 2,
				},
				schema: null,
				execute: async () => 'success',
			});

			let conduit = createMockConduit();
			let session_id = 'test-session-789';
			let session = createMockSession();
			
			registerTestSession(manager, session_id, session, conduit);

			// Record manual_setup then 3 other calls
			conduit.recordToolCall('manual_setup');
			conduit.recordToolCall('other1');
			conduit.recordToolCall('other2');
			conduit.recordToolCall('other3');

			let result = await manager.executeTool(
				manager.tools.get('test_calls_ago'),
				{},
				{ sessionId: session_id }
			);

			assert.strictEqual(result.isError, true);
			assert.ok(result.content[0].text.includes('within the last 2 tool calls'));
		});

		it('should allow when within max_calls_ago', async function() {
			let conduit = createMockConduit();
			let session_id = 'test-session-101';
			let session = createMockSession();
			
			registerTestSession(manager, session_id, session, conduit);

			// Record manual_setup then only 1 other call
			conduit.recordToolCall('manual_setup');
			conduit.recordToolCall('other1');

			let result = await manager.executeTool(
				manager.tools.get('test_calls_ago'),
				{},
				{ sessionId: session_id }
			);

			assert.strictEqual(result.isError, undefined);
		});

		it('should block when max_seconds_ago exceeded (non-auto_callable)', async function() {
			manager.tools.set('test_seconds_ago', {
				name: 'test_seconds_ago',
				description: 'Test max_seconds_ago',
				requires: {
					tool: 'manual_setup',  // non-auto_callable
					max_seconds_ago: 60,
				},
				schema: null,
				execute: async () => 'success',
			});

			let conduit = createMockConduit();
			let session_id = 'test-session-102';
			let session = createMockSession();
			
			registerTestSession(manager, session_id, session, conduit);

			// Record manual_setup
			conduit.recordToolCall('manual_setup');
			
			// Manually set last_called_at to 2 minutes ago
			manager.sessions.get(session_id).tool_history.by_tool['manual_setup'].last_called_at = Date.now() - 120000;

			let result = await manager.executeTool(
				manager.tools.get('test_seconds_ago'),
				{},
				{ sessionId: session_id }
			);

			assert.strictEqual(result.isError, true);
			assert.ok(result.content[0].text.includes('within the last 60 seconds'));
		});

		it('should detect circular auto_call dependencies', async function() {
			// Create a cycle: cycle_a -> cycle_b -> cycle_a
			manager.tools.set('cycle_a', {
				name: 'cycle_a',
				description: 'Part of a cycle',
				auto_callable: true,
				requires: 'cycle_b',
				schema: null,
				execute: async () => 'A',
			});

			manager.tools.set('cycle_b', {
				name: 'cycle_b',
				description: 'Part of a cycle',
				auto_callable: true,
				requires: 'cycle_a',
				schema: null,
				execute: async () => 'B',
			});

			manager.tools.set('trigger_cycle', {
				name: 'trigger_cycle',
				description: 'Triggers the cycle',
				requires: 'cycle_a',
				schema: null,
				execute: async () => 'triggered',
			});

			let conduit = createMockConduit();
			let session_id = 'test-session-cycle';
			let session = createMockSession();
			
			registerTestSession(manager, session_id, session, conduit);

			let result = await manager.executeTool(
				manager.tools.get('trigger_cycle'),
				{},
				{ sessionId: session_id }
			);

			assert.strictEqual(result.isError, true);
			assert.ok(result.content[0].text.includes('Circular'));
		});
	});

	describe('#validateAutoCallableTools()', function() {

		it('should throw error for auto_callable tool with required params', function() {
			let test_manager = new McpManager();
			
			// Create a schema with a required parameter
			let schema = alchemy.createSchema();
			schema.addField('required_param', 'String', { required: true });

			test_manager.tools.set('bad_auto_tool', {
				name: 'bad_auto_tool',
				description: 'Tool that should not be auto_callable',
				auto_callable: true,
				schema: schema,
				execute: async () => 'should not work',
			});

			assert.throws(() => {
				test_manager.validateAutoCallableTools();
			}, /auto_callable but has required parameters/);
		});

		it('should allow auto_callable tool with only optional params', function() {
			let test_manager = new McpManager();
			
			// Create a schema with only optional parameters
			let schema = alchemy.createSchema();
			schema.addField('optional_param', 'String', { required: false });

			test_manager.tools.set('good_auto_tool', {
				name: 'good_auto_tool',
				description: 'Tool that can be auto_callable',
				auto_callable: true,
				schema: schema,
				execute: async () => 'works',
			});

			// Should not throw
			test_manager.validateAutoCallableTools();
		});

		it('should allow auto_callable tool with no schema', function() {
			let test_manager = new McpManager();

			test_manager.tools.set('no_schema_tool', {
				name: 'no_schema_tool',
				description: 'Tool with no schema',
				auto_callable: true,
				schema: null,
				execute: async () => 'works',
			});

			// Should not throw
			test_manager.validateAutoCallableTools();
		});
	});

	describe('#executeToolInternal() and conduit.callTool()', function() {

		it('should execute tool and return raw result', async function() {
			manager.tools.set('internal_test', {
				name: 'internal_test',
				description: 'Tool for internal testing',
				schema: null,
				execute: async () => ({ data: 'raw result' }),
			});

			let conduit = createMockConduit();
			let session_id = 'test-internal-1';
			let session = createMockSession();
			
			registerTestSession(manager, session_id, session, conduit);
			conduit.mcp_server = { manager };

			let result = await conduit.callTool('internal_test', {});

			// Should return raw result, not MCP-formatted
			assert.deepStrictEqual(result, { data: 'raw result' });
			// Should be tracked in history
			assert.ok(conduit.hasCalledTool('internal_test'));
		});

		it('should throw for unknown tool', async function() {
			let conduit = createMockConduit();
			let session_id = 'test-internal-2';
			let session = createMockSession();
			
			registerTestSession(manager, session_id, session, conduit);
			conduit.mcp_server = { manager };

			await assert.rejects(async () => {
				await conduit.callTool('nonexistent_tool', {});
			}, /Tool not found/);
		});

		it('should resolve auto-call requirements when calling internally', async function() {
			manager.tools.set('internal_auto_req', {
				name: 'internal_auto_req',
				description: 'Auto-callable for internal test',
				auto_callable: true,
				schema: null,
				execute: async () => 'auto setup done',
			});

			manager.tools.set('internal_needs_auto', {
				name: 'internal_needs_auto',
				description: 'Needs auto_req',
				requires: 'internal_auto_req',
				schema: null,
				execute: async () => 'main executed',
			});

			let conduit = createMockConduit();
			let session_id = 'test-internal-3';
			let session = createMockSession();
			
			registerTestSession(manager, session_id, session, conduit);
			conduit.mcp_server = { manager };

			// Call the tool that has an auto-callable requirement
			let result = await conduit.callTool('internal_needs_auto', {});

			// Should succeed
			assert.strictEqual(result, 'main executed');
			// Both tools should be in history
			assert.ok(conduit.hasCalledTool('internal_auto_req'));
			assert.ok(conduit.hasCalledTool('internal_needs_auto'));
		});
	});

	describe('#formatResult() with injections', function() {

		it('should append injections to text result', function() {
			let conduit = createConduitWithSession();
			conduit.queueInjection('Important notice', { type: 'warning' });

			let result = manager.formatResult('Tool output', conduit);

			assert.ok(result.content[0].text.includes('Tool output'));
			assert.ok(result.content[0].text.includes('[!] Important notice'));
		});

		it('should append injections to MCP-formatted result', function() {
			let conduit = createConduitWithSession();
			conduit.queueInjection('Reminder', { type: 'reminder' });

			let mcp_result = {
				content: [{
					type: 'text',
					text: 'Existing content',
				}],
			};

			let result = manager.formatResult(mcp_result, conduit);

			assert.ok(result.content[0].text.includes('Existing content'));
			assert.ok(result.content[0].text.includes('[i] Reminder'));
		});
	});

	describe('#processInjectReminders()', function() {

		it('should inject reminder based on after_calls', async function() {
			manager.tools.set('reminder_tool', {
				name: 'reminder_tool',
				description: 'Tool with reminder',
				inject_reminder: {
					after_calls: 2,
					message: 'Remember to call reminder_tool!',
				},
				schema: null,
				execute: async () => 'ok',
			});

			let conduit = createConduitWithSession();

			// Record some calls to trigger the reminder
			conduit.recordToolCall('other_tool_1');
			conduit.recordToolCall('other_tool_2');

			await manager.processInjectReminders(conduit);

			let queued = conduit.mcp_session.queued_injections;
			assert.strictEqual(queued.length, 1);
			assert.strictEqual(queued[0].message, 'Remember to call reminder_tool!');
			assert.strictEqual(queued[0].type, 'reminder');
		});

		it('should not inject reminder when tool was called recently', async function() {
			let conduit = createConduitWithSession();

			// Call the reminder tool itself
			conduit.recordToolCall('reminder_tool');
			conduit.recordToolCall('other_tool');

			await manager.processInjectReminders(conduit);

			// Should NOT have queued a reminder for reminder_tool (only 1 call since)
			let reminder_injection = conduit.mcp_session.queued_injections.find(i => 
				i.message === 'Remember to call reminder_tool!'
			);
			assert.ok(!reminder_injection, 'Should not have reminder when tool was called recently');
		});

		it('should support function as inject_reminder', async function() {
			manager.tools.set('function_reminder_tool', {
				name: 'function_reminder_tool',
				description: 'Tool with function reminder',
				inject_reminder: async (conduit, history) => {
					if (history.total_calls > 0 && !history.by_tool['function_reminder_tool']) {
						return 'You should try function_reminder_tool!';
					}
					return null;
				},
				schema: null,
				execute: async () => 'ok',
			});

			let conduit = createConduitWithSession();
			conduit.recordToolCall('some_other_tool');

			await manager.processInjectReminders(conduit);

			let injection = conduit.mcp_session.queued_injections.find(i => 
				i.message === 'You should try function_reminder_tool!'
			);
			assert.ok(injection, 'Should have queued function-based reminder');
		});

		it('should support function as message in object config', async function() {
			let call_count = 0;

			manager.tools.set('dynamic_message_tool', {
				name: 'dynamic_message_tool',
				description: 'Tool with dynamic message',
				inject_reminder: {
					after_calls: 1,
					message: async (conduit, history) => {
						call_count++;
						return 'Dynamic reminder #' + call_count;
					},
				},
				schema: null,
				execute: async () => 'ok',
			});

			let conduit = createConduitWithSession();
			conduit.recordToolCall('other');

			await manager.processInjectReminders(conduit);

			let injection = conduit.mcp_session.queued_injections.find(i => 
				i.message && i.message.startsWith('Dynamic reminder')
			);
			assert.ok(injection, 'Should have queued dynamic message reminder');
		});

		it('should respect min_interval option', async function() {
			let check_call_count = 0;

			manager.tools.set('throttled_reminder_tool', {
				name: 'throttled_reminder_tool',
				description: 'Tool with throttled reminder',
				inject_reminder: {
					min_interval: 60, // 60 seconds between reminders
					check: async (conduit, history) => {
						check_call_count++;
						return 'Throttled reminder';
					},
				},
				schema: null,
				execute: async () => 'ok',
			});

			let conduit = createConduitWithSession();

			// First call - should inject
			await manager.processInjectReminders(conduit);
			assert.strictEqual(check_call_count, 1, 'Check should be called first time');
			
			let first_injection = conduit.mcp_session.queued_injections.find(i => 
				i.message === 'Throttled reminder'
			);
			assert.ok(first_injection, 'Should have first reminder');

			// Clear injections (must modify in place due to prepareProperty)
			conduit.mcp_session.queued_injections.length = 0;

			// Second call immediately - should be throttled (check not called)
			await manager.processInjectReminders(conduit);
			assert.strictEqual(check_call_count, 1, 'Check should NOT be called again (throttled)');
			
			let second_injection = conduit.mcp_session.queued_injections.find(i => 
				i.message === 'Throttled reminder'
			);
			assert.ok(!second_injection, 'Should NOT have second reminder (throttled)');
		});

		it('should support check function with min_interval', async function() {
			manager.tools.set('check_with_interval', {
				name: 'check_with_interval',
				description: 'Tool with check and interval',
				inject_reminder: {
					min_interval: 0, // No throttle for this test
					check: async (conduit, history) => {
						if (history.total_calls > 2) {
							return 'You have made ' + history.total_calls + ' calls';
						}
						return null;
					},
				},
				schema: null,
				execute: async () => 'ok',
			});

			let conduit = createConduitWithSession();

			// Only 2 calls - check returns null
			conduit.recordToolCall('a');
			conduit.recordToolCall('b');
			await manager.processInjectReminders(conduit);
			
			let no_injection = conduit.mcp_session.queued_injections.find(i => 
				i.message && i.message.includes('calls')
			);
			assert.ok(!no_injection, 'Should not inject when condition not met');

			// Third call - check returns message
			conduit.recordToolCall('c');
			await manager.processInjectReminders(conduit);
			
			let injection = conduit.mcp_session.queued_injections.find(i => 
				i.message === 'You have made 3 calls'
			);
			assert.ok(injection, 'Should inject when condition is met');
		});
	});

	describe('#shouldRecoverSession()', function() {

		it('should return false when no header and no API key config', function() {
			let conduit = createMockConduit();
			let result = manager.shouldRecoverSession(conduit);
			assert.strictEqual(result, false);
		});

		it('should return true when X-MCP-Recover-Session header is "true"', function() {
			let conduit = createMockConduit({
				headers: { 'x-mcp-recover-session': 'true' },
			});
			let result = manager.shouldRecoverSession(conduit);
			assert.strictEqual(result, true);
		});

		it('should return true when header is "1"', function() {
			let conduit = createMockConduit({
				headers: { 'x-mcp-recover-session': '1' },
			});
			let result = manager.shouldRecoverSession(conduit);
			assert.strictEqual(result, true);
		});

		it('should return true when header is "yes"', function() {
			let conduit = createMockConduit({
				headers: { 'x-mcp-recover-session': 'yes' },
			});
			let result = manager.shouldRecoverSession(conduit);
			assert.strictEqual(result, true);
		});

		it('should return false when header has non-truthy value', function() {
			let conduit = createMockConduit({
				headers: { 'x-mcp-recover-session': 'false' },
			});
			let result = manager.shouldRecoverSession(conduit);
			assert.strictEqual(result, false);
		});

		it('should return true when API key has default_headers with recover-session', function() {
			let conduit = createMockConduit();
			conduit._mcp_api_key = {
				default_headers: [
					{ name: 'X-MCP-Recover-Session', value: 'true' },
				],
			};

			let result = manager.shouldRecoverSession(conduit);
			assert.strictEqual(result, true);
		});

		it('should return false when API key default_headers has different header', function() {
			let conduit = createMockConduit();
			conduit._mcp_api_key = {
				default_headers: [
					{ name: 'X-Custom-Header', value: 'something' },
				],
			};

			let result = manager.shouldRecoverSession(conduit);
			assert.strictEqual(result, false);
		});

		it('should check header first before API key config', function() {
			let conduit = createMockConduit({
				headers: { 'x-mcp-recover-session': 'true' },
			});
			// API key says false, but header says true
			conduit._mcp_api_key = {
				default_headers: [
					{ name: 'X-MCP-Recover-Session', value: 'false' },
				],
			};

			// Header wins
			let result = manager.shouldRecoverSession(conduit);
			assert.strictEqual(result, true);
		});
	});
});
