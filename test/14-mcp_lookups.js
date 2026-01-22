var assert = require('assert');
var {
	createMockConduit,
	createMockSession,
	registerTestSession,
} = require('./helpers');

describe('MCP Parameter Lookups', function() {

	let McpManager;
	let manager;
	let TestLookupModel;
	let test_doc;

	before(async function() {
		McpManager = Classes.Thoth?.Mcp?.Manager;

		if (!McpManager) {
			throw new Error('Thoth.Mcp.Manager class not found');
		}

		// Create a simple test model for lookups
		TestLookupModel = Function.inherits('Alchemy.Model', 'TestLookup');

		TestLookupModel.constitute(function addFields() {
			this.addField('name', 'String');
			this.addField('slug', 'String');
			this.addField('code', 'String');
		});

		// Wait for model to be constituted
		await Pledge.after(TestLookupModel.constituted);

		// Create a test document
		let model = Model.get('TestLookup');
		test_doc = model.createDocument({
			name: 'Test Item',
			slug: 'test-item',
			code: 'TI001',
		});

		await test_doc.save();
	});

	beforeEach(function() {
		manager = new McpManager();
	});

	describe('Basic lookup functionality', function() {

		it('should fetch document by slug when lookup option is set', async function() {
			// Create a schema with lookup
			let schema = alchemy.createSchema();
			schema.addField('item_slug', 'String', {
				lookup: 'TestLookup',
				lookup_field: 'slug',
			});

			manager.tools.set('test_lookup_tool', {
				name: 'test_lookup_tool',
				description: 'Tool with lookup',
				schema: schema,
				execute: async (conduit, params) => {
					// The lookup should have added 'testlookup' to params
					return {
						has_testlookup: !!params.testlookup,
						testlookup_name: params.testlookup?.name,
						original_slug: params.item_slug,
					};
				},
			});

			let conduit = createMockConduit();
			let session_id = 'test-lookup-1';
			let session = createMockSession();

			registerTestSession(manager, session_id, session, conduit);

			let result = await manager.executeTool(
				manager.tools.get('test_lookup_tool'),
				{ item_slug: 'test-item' },
				{ sessionId: session_id }
			);

			assert.strictEqual(result.isError, undefined);
			let text = result.content[0].text;
			assert.ok(text.includes('"has_testlookup": true'), 'Should have testlookup in params');
			assert.ok(text.includes('"testlookup_name": "Test Item"'), 'Should have fetched document');
			assert.ok(text.includes('"original_slug": "test-item"'), 'Should keep original param');
		});

		it('should use custom lookup_as key', async function() {
			let schema = alchemy.createSchema();
			schema.addField('item_slug', 'String', {
				lookup: 'TestLookup',
				lookup_field: 'slug',
				lookup_as: 'my_item',
			});

			manager.tools.set('test_lookup_as_tool', {
				name: 'test_lookup_as_tool',
				description: 'Tool with custom lookup_as',
				schema: schema,
				execute: async (conduit, params) => {
					return {
						has_my_item: !!params.my_item,
						my_item_name: params.my_item?.name,
						has_testlookup: !!params.testlookup,
					};
				},
			});

			let conduit = createMockConduit();
			let session_id = 'test-lookup-2';
			let session = createMockSession();

			registerTestSession(manager, session_id, session, conduit);

			let result = await manager.executeTool(
				manager.tools.get('test_lookup_as_tool'),
				{ item_slug: 'test-item' },
				{ sessionId: session_id }
			);

			assert.strictEqual(result.isError, undefined);
			let text = result.content[0].text;
			assert.ok(text.includes('"has_my_item": true'), 'Should have my_item in params');
			assert.ok(text.includes('"my_item_name": "Test Item"'), 'Should have fetched document');
			assert.ok(text.includes('"has_testlookup": false'), 'Should NOT have testlookup (using custom key)');
		});

		it('should lookup by different field using lookup_field', async function() {
			let schema = alchemy.createSchema();
			schema.addField('item_code', 'String', {
				lookup: 'TestLookup',
				lookup_field: 'code',  // Search by code, not by item_code
				lookup_as: 'item',
			});

			manager.tools.set('test_lookup_field_tool', {
				name: 'test_lookup_field_tool',
				description: 'Tool with custom lookup_field',
				schema: schema,
				execute: async (conduit, params) => {
					return {
						has_item: !!params.item,
						item_name: params.item?.name,
					};
				},
			});

			let conduit = createMockConduit();
			let session_id = 'test-lookup-3';
			let session = createMockSession();

			registerTestSession(manager, session_id, session, conduit);

			let result = await manager.executeTool(
				manager.tools.get('test_lookup_field_tool'),
				{ item_code: 'TI001' },
				{ sessionId: session_id }
			);

			assert.strictEqual(result.isError, undefined);
			let text = result.content[0].text;
			assert.ok(text.includes('"has_item": true'), 'Should have item in params');
			assert.ok(text.includes('"item_name": "Test Item"'), 'Should have fetched document by code');
		});
	});

	describe('Error handling', function() {

		it('should throw NotFound error when document not found (default behavior)', async function() {
			let schema = alchemy.createSchema();
			schema.addField('item_slug', 'String', {
				lookup: 'TestLookup',
				lookup_field: 'slug',
			});

			manager.tools.set('test_lookup_notfound_tool', {
				name: 'test_lookup_notfound_tool',
				description: 'Tool with required lookup',
				schema: schema,
				execute: async (conduit, params) => 'should not reach here',
			});

			let conduit = createMockConduit();
			let session_id = 'test-lookup-4';
			let session = createMockSession();

			registerTestSession(manager, session_id, session, conduit);

			let result = await manager.executeTool(
				manager.tools.get('test_lookup_notfound_tool'),
				{ item_slug: 'nonexistent-slug' },
				{ sessionId: session_id }
			);

			assert.strictEqual(result.isError, true);
			assert.ok(result.content[0].text.includes('TestLookup "nonexistent-slug" not found'));
		});

		it('should skip lookup when lookup_required is false and document not found', async function() {
			let schema = alchemy.createSchema();
			schema.addField('item_slug', 'String', {
				lookup: 'TestLookup',
				lookup_field: 'slug',
				lookup_required: false,
			});

			manager.tools.set('test_lookup_optional_tool', {
				name: 'test_lookup_optional_tool',
				description: 'Tool with optional lookup',
				schema: schema,
				execute: async (conduit, params) => {
					return {
						has_testlookup: !!params.testlookup,
						original_slug: params.item_slug,
					};
				},
			});

			let conduit = createMockConduit();
			let session_id = 'test-lookup-5';
			let session = createMockSession();

			registerTestSession(manager, session_id, session, conduit);

			let result = await manager.executeTool(
				manager.tools.get('test_lookup_optional_tool'),
				{ item_slug: 'nonexistent-slug' },
				{ sessionId: session_id }
			);

			assert.strictEqual(result.isError, undefined);
			let text = result.content[0].text;
			assert.ok(text.includes('"has_testlookup": false'), 'Should NOT have testlookup (not found)');
			assert.ok(text.includes('"original_slug": "nonexistent-slug"'), 'Should keep original param');
		});

		it('should skip lookup when parameter value is empty', async function() {
			let schema = alchemy.createSchema();
			schema.addField('item_slug', 'String', {
				lookup: 'TestLookup',
				lookup_field: 'slug',
			});

			manager.tools.set('test_lookup_empty_tool', {
				name: 'test_lookup_empty_tool',
				description: 'Tool for empty param test',
				schema: schema,
				execute: async (conduit, params) => {
					return {
						has_testlookup: !!params.testlookup,
						item_slug_value: params.item_slug,
					};
				},
			});

			let conduit = createMockConduit();
			let session_id = 'test-lookup-6';
			let session = createMockSession();

			registerTestSession(manager, session_id, session, conduit);

			// Test with null value
			let result = await manager.executeTool(
				manager.tools.get('test_lookup_empty_tool'),
				{ item_slug: null },
				{ sessionId: session_id }
			);

			assert.strictEqual(result.isError, undefined);
			let text = result.content[0].text;
			assert.ok(text.includes('"has_testlookup": false'), 'Should NOT have testlookup (empty param)');
		});

		it('should throw error for invalid model name', async function() {
			let schema = alchemy.createSchema();
			schema.addField('item_slug', 'String', {
				lookup: 'NonexistentModel',
				lookup_field: 'slug',
			});

			manager.tools.set('test_invalid_model_tool', {
				name: 'test_invalid_model_tool',
				description: 'Tool with invalid model',
				schema: schema,
				execute: async (conduit, params) => 'should not reach here',
			});

			let conduit = createMockConduit();
			let session_id = 'test-lookup-7';
			let session = createMockSession();

			registerTestSession(manager, session_id, session, conduit);

			let result = await manager.executeTool(
				manager.tools.get('test_invalid_model_tool'),
				{ item_slug: 'test-item' },
				{ sessionId: session_id }
			);

			assert.strictEqual(result.isError, true);
			// The error message may vary - just check it's an error about the model
			assert.ok(
				result.content[0].text.includes('NonexistentModel'),
				'Error should mention the model name. Got: ' + result.content[0].text
			);
		});
	});

	describe('addTool with lookup parameters', function() {

		it('should work with addTool API', async function() {
			let TestToolsLookup = Function.inherits('Thoth.Mcp.Tools', 'TestToolsLookup');

			TestToolsLookup.addTool('lookup_test', {
				description: 'Test tool with lookup',
			}, function schema() {
				this.addParameter('item_slug', 'String', {
					mcp_description: 'The item slug',
					lookup: 'TestLookup',
					lookup_field: 'slug',
					lookup_as: 'item',
				});
			}, async function execute(conduit, params) {
				return {
					found_item: !!params.item,
					item_name: params.item?.name,
				};
			});

			// Wait for tool to be registered
			await Pledge.after(TestToolsLookup.constituted);

			// Discover tools
			await manager.discoverAllTools();

			// Should have the tool
			assert.ok(manager.tools.has('lookup_test'), 'Tool should be discovered');

			let conduit = createMockConduit();
			let session_id = 'test-lookup-8';
			let session = createMockSession();

			registerTestSession(manager, session_id, session, conduit);

			let result = await manager.executeTool(
				'lookup_test',
				{ item_slug: 'test-item' },
				{ sessionId: session_id }
			);

			assert.strictEqual(result.isError, undefined);
			let text = result.content[0].text;
			assert.ok(text.includes('"found_item": true'), 'Should have found item');
			assert.ok(text.includes('"item_name": "Test Item"'), 'Should have item name');
		});
	});

	after(async function() {
		// Clean up test document
		if (test_doc) {
			await test_doc.remove();
		}
	});
});
