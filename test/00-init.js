/* istanbul ignore file */
const MongoUnit = require('mongo-unit'),
      libpath   = require('path'),
      assert    = require('assert');

let mongo_uri;

// Make sure janeway doesn't start
process.env.DISABLE_JANEWAY = 1;

// Do not log load warnings
process.env.NO_ALCHEMY_LOAD_WARNING = 1;

// Set the path root to our test_root folder
process.env.PATH_ROOT = libpath.resolve(__dirname, 'test_root');

// Make MongoUnit a global
global.MongoUnit = MongoUnit;

// Require alchemymvc (sets up the global `alchemy` variable)
require('alchemymvc');

// Helper to resolve plugin paths from node_modules
function getPluginPath(plugin_name) {
	// Alchemy plugins don't have main entry points, so we resolve their package.json
	let package_json_path = require.resolve(plugin_name + '/package.json');
	return libpath.dirname(package_json_path);
}

describe('require(\'alchemymvc\')', function() {
	it('should create the global STAGES instance', function() {
		assert.equal('object', typeof STAGES);
	});
});

describe('Mongo-unit setup', function() {
	this.timeout(150000);

	it('should create in-memory mongodb instance first', async function() {
		let url = await MongoUnit.start({verbose: false});
		mongo_uri = url;

		if (!url) {
			throw new Error('Failed to create mongo-unit instance');
		}
	});
});

describe('Alchemy', function() {
	this.timeout(60000);

	describe('#start(callback)', function() {
		it('should start the server with the thoth plugin', function(done) {

			// Configure network settings
			alchemy.setSetting('network.port', 3470);
			alchemy.setSetting('performance.postpone_requests_on_overload', false);

			// Configure datasource - create it in a postTask (after the connect stage tries to
			// load from database.js which doesn't exist in the test). The datasource will
			// connect lazily when first queried.
			STAGES.getStage('datasource').addPostTask(() => {
				Datasource.create('mongo', 'default', {uri: mongo_uri});
			});

			// Load alchemy-form plugin (required by alchemy-acl)
			let form_path = getPluginPath('alchemy-form');
			alchemy.usePlugin('form', {path_to_plugin: form_path});

			// Load alchemy-acl plugin (provides User model and Permissions field)
			let acl_path = getPluginPath('alchemy-acl');
			alchemy.usePlugin('acl', {path_to_plugin: acl_path});

			// Load the thoth plugin with MCP server configuration
			let thoth_path = libpath.resolve(__dirname, '..');
			alchemy.usePlugin('thoth', {
				path_to_plugin: thoth_path,
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
				}
			});

			// Start the server
			alchemy.start({silent: true}, function started(err) {
				if (err) {
					return done(err);
				}
				done();
			});
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
