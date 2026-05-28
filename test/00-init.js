/* istanbul ignore file */
const TestHarness = require('alchemymvc/testing'),
      libpath     = require('path'),
      assert      = require('assert');

// Pin a modern (OpenSSL-3 compatible) mongod binary, and point its data
// dir at tmpfs when available. Without the version pin, the default
// mongod binary needs libcrypto.so.1.1 and fails to start on a Node-26 /
// OpenSSL-3 box. The harness forces the wiredTiger storage engine itself.
const MONGO_VERSION = process.env.MONGOMS_VERSION || '7.0.14';

let mongo_dbpath;
try {
	if (require('fs').statSync('/dev/shm').isDirectory()) {
		mongo_dbpath = libpath.join('/dev/shm', 'thoth-mongo-unit');
	}
} catch (err) {
	// No tmpfs (e.g. macOS/Windows) - fall back to mongo-unit's on-disk default.
}

// Create the test harness with plugin configuration
const harness = new TestHarness({
	path_root          : libpath.resolve(__dirname, 'test_root'),
	environment        : 'test',
	skip_local_config  : true,
	port               : 3470,
	mongo_unit_options : {
		version : MONGO_VERSION,
		...(mongo_dbpath ? { dbpath: mongo_dbpath } : {}),
	},
	plugins           : {
		// Load form plugin (required by acl)
		'form': {},

		// Load acl plugin (provides User model and Permissions field)
		'acl': {},

		// Load the thoth plugin with MCP server configuration
		'thoth': {
			path_to_plugin : libpath.resolve(__dirname, '..'),
			// Configure MCP servers for testing
			mcp_servers: {
				// Server without authentication (for most tests)
				test: {
					path            : '/mcp',
					require_api_key : false,
					allow_anonymous : true,
				},
				// Server with authentication (for API key tests)
				auth: {
					path            : '/mcp-auth',
					require_api_key : true,
					allow_anonymous : false,
				},
			},
		},
	},
});

// Export harness globally for use in other test files
global.harness = harness;

// Export MongoUnit for compatibility (though not really needed anymore)
global.MongoUnit = harness.getMongoUnit();

// =============================================================================
// Test Setup
// =============================================================================

describe('require(\'alchemymvc\')', function() {
	this.timeout(150000);

	it('should start in-memory MongoDB', async function() {
		await harness.startMongo();
	});

	it('should create the global STAGES instance', function() {
		harness.requireAlchemy();
		assert.equal('object', typeof STAGES);
	});
});

describe('Alchemy', function() {
	this.timeout(60000);

	describe('#start(callback)', function() {
		it('should start the server with the thoth plugin', async function() {
			await harness.startServer();
		});
	});
});

describe('Alchemy-Thoth', function() {

	it('should have loaded the plugin namespace', function() {
		assert.ok(Classes.Thoth, 'Thoth namespace should exist');
	});

	it('should have loaded MCP classes', function() {
		assert.ok(Classes.Thoth.Mcp, 'Thoth.Mcp namespace should exist');
		assert.ok(Classes.Thoth.Mcp.Manager, 'Thoth.Mcp.Manager should exist');
		assert.ok(Classes.Thoth.Mcp.Tools, 'Thoth.Mcp.Tools should exist');
	});

	it('should have loaded MCP Error classes', function() {
		assert.ok(Classes.Thoth.Mcp.Error, 'Thoth.Mcp.Error base class should exist');
		assert.ok(Classes.Thoth.Mcp.Error.NotFound, 'Thoth.Mcp.Error.NotFound should exist');
		assert.ok(Classes.Thoth.Mcp.Error.PermissionDenied, 'Thoth.Mcp.Error.PermissionDenied should exist');
	});

	it('should have loaded MCP Conduit', function() {
		assert.ok(Classes.Thoth.Conduit, 'Thoth.Conduit namespace should exist');
		assert.ok(Classes.Thoth.Conduit.Mcp, 'Thoth.Conduit.Mcp should exist');
	});

	it('should have registered MCP routes', function() {
		// Route names use format: Mcp@{server}#{method}
		let url = Router.getUrl('Mcp@test#post');
		assert.ok(url, 'MCP POST route should be registered');
	});
});
