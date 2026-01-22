var assert = require('assert');
var {
	getMcpUrl,
	extractResponse,
	mcpRequestAsync,
	initializeSession,
	callTool,
} = require('./helpers');

describe('MCP HTTP Endpoints', function() {

	let mcp_url;
	let session_id;

	before(function() {
		mcp_url = getMcpUrl();
	});

	describe('POST /mcp - Session Initialization', function() {

		it('should return error for invalid JSON', async function() {
			try {
				await new Promise((resolve, reject) => {
					Blast.fetch(mcp_url, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Accept': 'application/json, text/event-stream',
						},
						body: 'not valid json',
					}, (err, res, body) => {
						if (err) return resolve(err); // We expect an error
						reject(new Error('Should have returned an error'));
					});
				});
			} catch (e) {
				assert.fail('Should not throw');
			}
		});

		it('should reject requests without session or initialize', async function() {
			try {
				await mcpRequestAsync(mcp_url, {
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/list',
				});
				assert.fail('Should have thrown');
			} catch (err) {
				assert.ok(err instanceof Error, 'Should return error without session');
			}
		});

		it('should initialize a new session', async function() {
			session_id = await initializeSession(mcp_url, 'test-client');
			assert.ok(session_id, 'Should have session ID');
		});
	});

	describe('POST /mcp - JSON-RPC Protocol (with session)', function() {

		it('should handle tools/list request', async function() {
			let { result } = await mcpRequestAsync(mcp_url, {
				jsonrpc: '2.0',
				id: 2,
				method: 'tools/list',
			}, session_id);

			assert.strictEqual(result.jsonrpc, '2.0');
			assert.strictEqual(result.id, 2);
			assert.ok(result.result, 'Should have result');
			assert.ok(Array.isArray(result.result.tools), 'Should have tools array');

			let tool_names = result.result.tools.map(t => t.name);
			assert.ok(tool_names.includes('init_session'), 'Should have init_session tool');
			assert.ok(tool_names.includes('echo'), 'Should have echo tool');
		});

		it('should call echo tool successfully', async function() {
			let result = await callTool(mcp_url, session_id, 'echo', { message: 'hello world' });

			assert.ok(!result.error, 'Echo should succeed');
			assert.ok(result.result.content[0].text.includes('hello world'), 'Should echo the message');
		});

		it('should call init_session tool successfully', async function() {
			let result = await callTool(mcp_url, session_id, 'init_session', {});

			assert.ok(!result.error, 'Should not have error');
			assert.ok(result.result, 'Should have result');
			assert.ok(result.result.content[0].text.includes('Session initialized'), 'Should confirm session initialization');
		});

		it('should call calculate tool with parameters', async function() {
			let result = await callTool(mcp_url, session_id, 'calculate', {
				a: 5,
				b: 3,
				operation: 'add',
			});

			assert.ok(!result.error, 'Should not have error');
			assert.ok(result.result.content[0].text.includes('8'), 'Should return 5+3=8');
		});

		it('should return error for unknown tool', async function() {
			let result = await callTool(mcp_url, session_id, 'nonexistent_tool', {});

			assert.ok(result.error || result.result?.isError, 'Should have error');
		});

		it('should return error for unknown method', async function() {
			let { result } = await mcpRequestAsync(mcp_url, {
				jsonrpc: '2.0',
				id: 7,
				method: 'unknown/method',
			}, session_id);

			assert.ok(result.error, 'Should have error');
			assert.strictEqual(result.error.code, -32601, 'Should be method not found error');
		});
	});

	describe('Session Tracking', function() {

		it('should track init_session calls', async function() {
			// Call init_session (it was already called earlier, so this is a repeat call)
			let result = await callTool(mcp_url, session_id, 'init_session', {});

			assert.ok(!result.error, 'init_session should succeed');
			assert.ok(result.result.content[0].text.includes('Session initialized'), 'Should show initialized message');
		});
	});

	describe('GET /mcp - SSE Endpoint', function() {

		it('should be available for SSE connections', function(done) {
			const http = require('http');
			
			let req = http.request(mcp_url, {
				method: 'GET',
				headers: {
					'Accept': 'text/event-stream',
					'Mcp-Session-Id': session_id,
				},
			}, function(res) {
				assert.strictEqual(res.statusCode, 200);
				assert.ok(res.headers['content-type']?.includes('text/event-stream'), 'Should return SSE content type');
				
				req.destroy();
				done();
			});
			
			req.on('error', function(err) {
				if (err.code === 'ECONNRESET') return;
				done(err);
			});
			
			req.end();
		});
	});

	describe('Session Not Found', function() {

		it('should return error for invalid session ID', async function() {
			try {
				await mcpRequestAsync(mcp_url, {
					jsonrpc: '2.0',
					id: 9,
					method: 'tools/list',
				}, 'invalid-session-id');
				assert.fail('Should have thrown');
			} catch (err) {
				assert.ok(err instanceof Error, 'Should return error for invalid session');
			}
		});
	});

	describe('Tool Requires Feature (end-to-end)', function() {

		let fresh_session_id;

		it('should initialize a fresh session for requires tests', async function() {
			fresh_session_id = await initializeSession(mcp_url, 'requires-test');
			assert.ok(fresh_session_id, 'Should have new session ID');
		});

		it('should auto-call init_session when guarded_echo is called first', async function() {
			// Since init_session is auto_callable, calling guarded_echo without 
			// init_session should auto-call init_session first
			let result = await callTool(mcp_url, fresh_session_id, 'guarded_echo', { message: 'test' });

			assert.ok(!result.result?.isError, 'Should not have error (auto-call should work)');
			
			let text = result.result.content[0].text;
			// Should include auto-call output
			assert.ok(text.includes('<auto-called-tools>'), 'Should show auto-call section');
			assert.ok(text.includes('init_session'), 'Should mention init_session was auto-called');
			// Should include the actual guarded_echo result
			assert.ok(text.includes('test'), 'Should echo the message');
			assert.ok(text.includes('This tool required init_session'), 'Should include success message');
		});

		it('should call init_session directly (already called via auto-call)', async function() {
			let result = await callTool(mcp_url, fresh_session_id, 'init_session', {});

			assert.ok(!result.error, 'Should not have error');
			assert.ok(result.result.content[0].text.includes('Session initialized'), 'Should confirm session');
		});

		it('should allow guarded_echo without auto-call (init_session already in history)', async function() {
			let result = await callTool(mcp_url, fresh_session_id, 'guarded_echo', { message: 'hello from guarded tool' });

			assert.ok(!result.result?.isError, 'Should not have error');
			
			let text = result.result.content[0].text;
			// Should NOT include auto-call output (init_session already in history)
			assert.ok(!text.includes('<auto-called-tools>'), 'Should NOT show auto-call section');
			assert.ok(
				text.includes('hello from guarded tool'),
				'Should echo the message'
			);
			assert.ok(
				text.includes('This tool required init_session'),
				'Should include success message'
			);
		});

		it('should verify session tool_history is persisted correctly', function() {
			let server = alchemy.plugins.thoth.getMcpServer('test');
			let manager = server?.manager;
			
			assert.ok(manager, 'MCP manager should exist');
			assert.ok(manager.sessions, 'Manager should have sessions Map');
			
			let session = manager.sessions.get(fresh_session_id);
			
			assert.ok(session, 'Session should exist for fresh_session_id');
			assert.ok(session.conduit, 'Session should have a conduit');
			assert.ok(session.tool_history, 'Session should have tool_history');
			
			assert.ok(
				session.tool_history.by_tool['init_session'],
				'tool_history should have init_session entry'
			);
			assert.ok(
				session.tool_history.by_tool['init_session'].call_count >= 1,
				'init_session should have been called at least once'
			);
			
			assert.ok(
				session.tool_history.by_tool['guarded_echo'],
				'tool_history should have guarded_echo entry'
			);
		});
	});

	describe('Tool Requires Feature - Sequential Sessions', function() {
		
		let test_session_id;

		it('should create a new session and make multiple tool calls', async function() {
			this.timeout(15000);
			
			// Initialize
			test_session_id = await initializeSession(mcp_url, 'sequential-test');
			assert.ok(test_session_id, 'Should have session ID');
			
			// Call init_session
			let start_result = await callTool(mcp_url, test_session_id, 'init_session', {});
			assert.ok(!start_result.error, 'init_session should succeed');
			
			// Call guarded_echo - should work because init_session was called
			let echo_result = await callTool(mcp_url, test_session_id, 'guarded_echo', { message: 'test message' });
			
			if (echo_result.result?.isError) {
				assert.fail('guarded_echo should NOT be blocked after init_session, got: ' + echo_result.result.content[0].text);
			}
			
			assert.ok(echo_result.result, 'guarded_echo should have a result');
		});

		it('should verify tool history is persisted', function() {
			let server = alchemy.plugins.thoth.getMcpServer('test');
			let manager = server?.manager;
			let session = manager.sessions.get(test_session_id);
			
			assert.ok(session, 'Session should exist');
			assert.ok(session.tool_history, 'Session should have tool_history');
			assert.ok(session.tool_history.by_tool['init_session'], 'Should have init_session in history');
			assert.ok(session.tool_history.by_tool['guarded_echo'], 'Should have guarded_echo in history');
			assert.strictEqual(session.tool_history.total_calls, 2, 'Should have 2 total tool calls');
		});
	});

	describe('API Key Authentication', function() {

		let Client;
		let StreamableHTTPClientTransport;
		let auth_url;
		let api_key_doc;
		let raw_key;

		before(async function() {
			auth_url = getMcpUrl('auth');
			
			// Import MCP SDK
			const clientModule = await import('@modelcontextprotocol/sdk/client/index.js');
			const transportModule = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
			
			Client = clientModule.Client;
			StreamableHTTPClientTransport = transportModule.StreamableHTTPClientTransport;
		});

		it('should reject requests without API key', async function() {
			this.timeout(10000);
			
			let client = new Client({
				name: 'no-auth-test',
				version: '1.0.0',
			}, {
				capabilities: {},
			});
			
			let transport = new StreamableHTTPClientTransport(new URL(auth_url));
			
			try {
				await client.connect(transport);
				assert.fail('Should have rejected connection without API key');
			} catch (err) {
				// The SDK throws when the server rejects the connection
				assert.ok(
					err.message.includes('Unauthorized') || 
					err.message.includes('401') ||
					err.message.includes('API key required'), 
					'Error should indicate unauthorized: ' + err.message
				);
			}
		});

		it('should reject requests with invalid API key', async function() {
			this.timeout(10000);
			
			let client = new Client({
				name: 'invalid-key-test',
				version: '1.0.0',
			}, {
				capabilities: {},
			});
			
			let transport = new StreamableHTTPClientTransport(new URL(auth_url), {
				requestInit: {
					headers: {
						'Authorization': 'Bearer invalid_key_12345',
					},
				},
			});
			
			try {
				await client.connect(transport);
				assert.fail('Should have rejected connection with invalid API key');
			} catch (err) {
				assert.ok(
					err.message.includes('Unauthorized') || 
					err.message.includes('401') ||
					err.message.includes('Invalid API key'),
					'Error should indicate unauthorized: ' + err.message
				);
			}
		});

		it('should create an API key for testing', async function() {
			let McpApiKey = Model.get('Thoth_McpApiKey');
			
			api_key_doc = McpApiKey.createDocument({
				name: 'Test API Key',
				is_active: true,
				allowed_servers: ['auth'],  // Allow access to the auth server
			});
			
			raw_key = api_key_doc.generateKey();
			await api_key_doc.save();
			
			assert.ok(raw_key, 'Should have generated a key');
			assert.ok(raw_key.startsWith('mcp_'), 'Key should start with mcp_');
		});

		it('should accept requests with valid API key', async function() {
			this.timeout(10000);
			
			let client = new Client({
				name: 'valid-key-test',
				version: '1.0.0',
			}, {
				capabilities: {},
			});
			
			let transport = new StreamableHTTPClientTransport(new URL(auth_url), {
				requestInit: {
					headers: {
						'Authorization': 'Bearer ' + raw_key,
					},
				},
			});
			
			await client.connect(transport);
			
			assert.ok(transport.sessionId, 'Should have session ID after connect');
			
			// Verify we can list tools
			let tools = await client.listTools();
			assert.ok(Array.isArray(tools.tools), 'Should be able to list tools');
			
			await client.close();
		});

		it('should reject expired API keys', async function() {
			this.timeout(10000);
			
			let McpApiKey = Model.get('Thoth_McpApiKey');
			
			let expired_doc = McpApiKey.createDocument({
				name: 'Expired Key',
				is_active: true,
				allowed_servers: ['auth'],
				expires: new Date(Date.now() - 86400000), // Expired yesterday
			});
			
			let expired_key = expired_doc.generateKey();
			await expired_doc.save();
			
			let client = new Client({
				name: 'expired-key-test',
				version: '1.0.0',
			}, {
				capabilities: {},
			});
			
			let transport = new StreamableHTTPClientTransport(new URL(auth_url), {
				requestInit: {
					headers: {
						'Authorization': 'Bearer ' + expired_key,
					},
				},
			});
			
			try {
				await client.connect(transport);
				assert.fail('Should have rejected connection with expired API key');
			} catch (err) {
				assert.ok(
					err.message.includes('Unauthorized') || 
					err.message.includes('401') ||
					err.message.includes('expired') ||
					err.message.includes('Invalid API key'),
					'Error should indicate expired/unauthorized: ' + err.message
				);
			}
		});

		it('should reject inactive API keys', async function() {
			this.timeout(10000);
			
			let McpApiKey = Model.get('Thoth_McpApiKey');
			
			let inactive_doc = McpApiKey.createDocument({
				name: 'Inactive Key',
				is_active: false,
				allowed_servers: ['auth'],
			});
			
			let inactive_key = inactive_doc.generateKey();
			await inactive_doc.save();
			
			let client = new Client({
				name: 'inactive-key-test',
				version: '1.0.0',
			}, {
				capabilities: {},
			});
			
			let transport = new StreamableHTTPClientTransport(new URL(auth_url), {
				requestInit: {
					headers: {
						'Authorization': 'Bearer ' + inactive_key,
					},
				},
			});
			
			try {
				await client.connect(transport);
				assert.fail('Should have rejected connection with inactive API key');
			} catch (err) {
				assert.ok(
					err.message.includes('Unauthorized') || 
					err.message.includes('401') ||
					err.message.includes('inactive') ||
					err.message.includes('Invalid API key'),
					'Error should indicate inactive/unauthorized: ' + err.message
				);
			}
		});
	});

	describe('Session Persistence After Transport Close (using MCP Client SDK)', function() {
		let Client;
		let StreamableHTTPClientTransport;
		let CallToolResultSchema;
		let persistent_session_id;
		let client;
		let transport;
		
		before(async function() {
			const clientModule = await import('@modelcontextprotocol/sdk/client/index.js');
			const transportModule = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
			const typesModule = await import('@modelcontextprotocol/sdk/types.js');
			
			Client = clientModule.Client;
			StreamableHTTPClientTransport = transportModule.StreamableHTTPClientTransport;
			CallToolResultSchema = typesModule.CallToolResultSchema;
		});
		
		it('should connect and call init_session', async function() {
			this.timeout(10000);
			
			client = new Client({
				name: 'persistence-test-client',
				version: '1.0.0',
			}, {
				capabilities: {},
			});
			
			transport = new StreamableHTTPClientTransport(new URL(mcp_url));
			await client.connect(transport);
			
			persistent_session_id = transport.sessionId;
			assert.ok(persistent_session_id, 'Should have session ID after connect');
			
			let result = await client.request({
				method: 'tools/call',
				params: {
					name: 'init_session',
					arguments: {},
				},
			}, CallToolResultSchema);
			
			assert.ok(result.content, 'init_session should return content');
			assert.ok(!result.isError, 'init_session should not be an error');
		});
		
		it('should close transport and verify session persists', async function() {
			await transport.close();
			
			let server = alchemy.plugins.thoth.getMcpServer('test');
			let manager = server?.manager;
			let session = manager.sessions.get(persistent_session_id);
			
			assert.ok(session, 'Session should still exist after transport close');
			assert.ok(session.tool_history?.by_tool['init_session'], 'Tool history should be preserved');
			assert.ok(session._sdk_handler, 'Session should have an SDK handler instance');
		});
		
		it('should reconnect with same session ID and call guarded_echo', async function() {
			this.timeout(10000);
			
			client = new Client({
				name: 'persistence-test-client-reconnect',
				version: '1.0.0',
			}, {
				capabilities: {},
			});
			
			transport = new StreamableHTTPClientTransport(new URL(mcp_url), {
				sessionId: persistent_session_id,
			});
			
			await client.connect(transport);
			
			assert.strictEqual(transport.sessionId, persistent_session_id, 'Should use same session ID');
			
			let result = await client.request({
				method: 'tools/call',
				params: {
					name: 'guarded_echo',
					arguments: { message: 'after reconnect' },
				},
			}, CallToolResultSchema);
			
			assert.ok(result.content, 'guarded_echo should return content');
			assert.ok(!result.isError, 'guarded_echo should not be an error');
			assert.ok(
				result.content[0]?.text?.includes('after reconnect'),
				'Should include the echoed message'
			);
		});
		
		it('should verify session state is preserved after reconnection', function() {
			let server = alchemy.plugins.thoth.getMcpServer('test');
			let manager = server?.manager;
			let session = manager.sessions.get(persistent_session_id);
			
			assert.ok(session, 'Session should exist');
			assert.ok(session._sdk_handler, 'Session should have an SDK handler instance');
			assert.strictEqual(session.tool_history.total_calls, 2, 'Should have 2 tool calls (init_session + guarded_echo)');
		});
		
		after(async function() {
			if (transport) {
				try {
					await transport.close();
				} catch (e) {
					// Ignore close errors
				}
			}
		});
	});
});
