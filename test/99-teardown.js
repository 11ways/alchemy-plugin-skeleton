/* istanbul ignore file */

describe('Teardown', function() {
	it('should stop all services', async function() {
		await harness.stop();
	});
});
