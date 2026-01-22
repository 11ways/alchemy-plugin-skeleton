var assert = require('assert');

describe('ToolHistoryEntry', function() {

	let ToolHistoryEntry;

	before(function() {
		ToolHistoryEntry = Classes.Thoth?.Mcp?.ToolHistoryEntry;
		
		if (!ToolHistoryEntry) {
			throw new Error('Thoth.Mcp.ToolHistoryEntry class not found');
		}
	});

	describe('initial state', function() {

		it('should have call_count of 0', function() {
			let entry = new ToolHistoryEntry();
			assert.strictEqual(entry.call_count, 0);
		});

		it('should have last_called_at of null', function() {
			let entry = new ToolHistoryEntry();
			assert.strictEqual(entry.last_called_at, null);
		});

		it('should have calls_since_last of 0', function() {
			let entry = new ToolHistoryEntry();
			assert.strictEqual(entry.calls_since_last, 0);
		});

		it('should report hasBeenCalled() as false', function() {
			let entry = new ToolHistoryEntry();
			assert.strictEqual(entry.hasBeenCalled(), false);
		});
	});

	describe('#recordCall()', function() {

		it('should increment call_count', function() {
			let entry = new ToolHistoryEntry();
			entry.recordCall();
			assert.strictEqual(entry.call_count, 1);
			entry.recordCall();
			assert.strictEqual(entry.call_count, 2);
		});

		it('should set last_called_at to current time', function() {
			let entry = new ToolHistoryEntry();
			let before = Date.now();
			entry.recordCall();
			let after = Date.now();
			
			assert.ok(entry.last_called_at >= before);
			assert.ok(entry.last_called_at <= after);
		});

		it('should accept custom timestamp', function() {
			let entry = new ToolHistoryEntry();
			let custom_time = 1234567890;
			entry.recordCall(custom_time);
			
			assert.strictEqual(entry.last_called_at, custom_time);
		});

		it('should reset calls_since_last to 0', function() {
			let entry = new ToolHistoryEntry();
			entry.calls_since_last = 5;
			entry.recordCall();
			
			assert.strictEqual(entry.calls_since_last, 0);
		});

		it('should report hasBeenCalled() as true after call', function() {
			let entry = new ToolHistoryEntry();
			entry.recordCall();
			assert.strictEqual(entry.hasBeenCalled(), true);
		});
	});

	describe('#incrementCallsSince()', function() {

		it('should increment calls_since_last', function() {
			let entry = new ToolHistoryEntry();
			entry.recordCall();
			
			entry.incrementCallsSince();
			assert.strictEqual(entry.calls_since_last, 1);
			
			entry.incrementCallsSince();
			assert.strictEqual(entry.calls_since_last, 2);
		});
	});

	describe('#wasCalledWithin()', function() {

		it('should return false if never called', function() {
			let entry = new ToolHistoryEntry();
			assert.strictEqual(entry.wasCalledWithin(), false);
		});

		it('should return true if called and no options', function() {
			let entry = new ToolHistoryEntry();
			entry.recordCall();
			assert.strictEqual(entry.wasCalledWithin(), true);
		});

		it('should respect max_calls_ago constraint', function() {
			let entry = new ToolHistoryEntry();
			entry.recordCall();
			entry.calls_since_last = 3;
			
			// Within 5 calls ago
			assert.strictEqual(entry.wasCalledWithin({ max_calls_ago: 5 }), true);
			
			// More than 2 calls ago
			assert.strictEqual(entry.wasCalledWithin({ max_calls_ago: 2 }), false);
		});

		it('should respect max_seconds_ago constraint', function() {
			let entry = new ToolHistoryEntry();
			
			// Called 60 seconds ago
			entry.call_count = 1;
			entry.last_called_at = Date.now() - 60000;
			
			// Within 120 seconds
			assert.strictEqual(entry.wasCalledWithin({ max_seconds_ago: 120 }), true);
			
			// Not within 30 seconds
			assert.strictEqual(entry.wasCalledWithin({ max_seconds_ago: 30 }), false);
		});

		it('should check both constraints together', function() {
			let entry = new ToolHistoryEntry();
			entry.call_count = 1;
			entry.last_called_at = Date.now() - 60000;
			entry.calls_since_last = 3;
			
			// Fails max_calls_ago even though max_seconds_ago passes
			assert.strictEqual(entry.wasCalledWithin({ 
				max_calls_ago: 2, 
				max_seconds_ago: 120 
			}), false);
			
			// Fails max_seconds_ago even though max_calls_ago passes
			assert.strictEqual(entry.wasCalledWithin({ 
				max_calls_ago: 5, 
				max_seconds_ago: 30 
			}), false);
		});
	});

	describe('#getSecondsSinceLastCall()', function() {

		it('should return null if never called', function() {
			let entry = new ToolHistoryEntry();
			assert.strictEqual(entry.getSecondsSinceLastCall(), null);
		});

		it('should return approximate seconds since last call', function() {
			let entry = new ToolHistoryEntry();
			entry.call_count = 1;
			entry.last_called_at = Date.now() - 5000; // 5 seconds ago
			
			let seconds = entry.getSecondsSinceLastCall();
			assert.ok(seconds >= 4 && seconds <= 6, `Expected ~5 seconds, got ${seconds}`);
		});
	});

	describe('#toJSON()', function() {

		it('should return plain object with all properties', function() {
			let entry = new ToolHistoryEntry();
			entry.recordCall(1234567890);
			entry.calls_since_last = 3;
			
			let json = entry.toJSON();
			
			assert.deepStrictEqual(json, {
				call_count: 1,
				last_called_at: 1234567890,
				calls_since_last: 3,
			});
		});

		it('should work with JSON.stringify', function() {
			let entry = new ToolHistoryEntry();
			entry.recordCall(1234567890);
			
			let str = JSON.stringify(entry);
			let parsed = JSON.parse(str);
			
			assert.strictEqual(parsed.call_count, 1);
			assert.strictEqual(parsed.last_called_at, 1234567890);
			assert.strictEqual(parsed.calls_since_last, 0);
		});
	});
});
