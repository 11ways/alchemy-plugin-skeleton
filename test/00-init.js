var assert = require('assert'),
    MongoUnit = require('mongo-unit'),
    libpath   = require('path'),
    mongo_uri;

// Make sure janeway doesn't start
process.env.DISABLE_JANEWAY = 1;

// Make MongoUnit a global
global.MongoUnit = MongoUnit;

// Require AlchemyMVC & load this plugin
describe('AlchemyMVC', function() {
	this.timeout(10000);
	this.slow(5000);

	it('is needed to run plugin tests', function() {
		require('alchemymvc');
		assert.equal('object', typeof alchemy);

		// Unset the default port
		alchemy.settings.port = null;

		// Tell it we're running unit tests
		alchemy.unit_testing = true;
	});

	// Mongo-unit gives you in-memory mongodb support
	describe('Mongo-unit setup', function() {
		this.timeout(70000)

		it('should create in-memory mongodb instance first', async function() {

			var url = await MongoUnit.start();

			mongo_uri = url;

			if (!url) {
				throw new Error('Failed to create mongo-unit instance');
			}
		});
	});

	// This will load alchemy & start the server on a random port
	// + define the mongo-unit datasource
	describe('#start(callback)', function() {
		it('should start the server', async function() {

			var pledge = alchemy.start({silent: true});

			// Also create the mongodb datasource
			Datasource.create('mongo', 'default', {uri: mongo_uri});

			// Resolve the path to the plugin folder
			let path_to_plugin = libpath.resolve(__filename, '..', '..');

			// Load the package.json
			let package = require(libpath.resolve(path_to_plugin, 'package.json'));

			// Use this plugin
			alchemy.usePlugin(package.name, {path_to_plugin: path_to_plugin});

			await pledge;
		});
	});
});

describe('Alchemy-Plugin-Skeleton', function() {

	it('should contain your own tests', function() {
		throw new Error('Put your tests here!');
	});

});