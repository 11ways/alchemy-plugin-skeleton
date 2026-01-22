/**
 * Tool History Entry - tracks call statistics for a single tool
 *
 * Encapsulates the state and behavior for tracking how often
 * and when a specific tool has been called within a session.
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
const ToolHistoryEntry = Function.inherits('Thoth.Mcp.Base', 'Thoth.Mcp', function ToolHistoryEntry() {

	// Number of times this tool has been called
	this.call_count = 0;

	// Timestamp of when this tool was last called
	this.last_called_at = null;

	// Number of other tool calls since this tool was last called
	this.calls_since_last = 0;
});

/**
 * Record a call to this tool
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {number}   timestamp   Optional timestamp (defaults to now)
 */
ToolHistoryEntry.setMethod(function recordCall(timestamp) {
	this.call_count++;
	this.last_called_at = timestamp || Date.now();
	this.calls_since_last = 0;
});

/**
 * Increment the calls_since_last counter
 * Called when another tool is invoked
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
ToolHistoryEntry.setMethod(function incrementCallsSince() {
	this.calls_since_last++;
});

/**
 * Check if this tool has been called
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {boolean}
 */
ToolHistoryEntry.setMethod(function hasBeenCalled() {
	return this.call_count > 0;
});

/**
 * Check if this tool was called within the specified constraints
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}   options
 * @param    {number}   options.max_calls_ago    - Must be within last N calls
 * @param    {number}   options.max_seconds_ago  - Must be within last N seconds
 *
 * @return   {boolean}
 */
ToolHistoryEntry.setMethod(function wasCalledWithin(options) {
	
	if (!this.hasBeenCalled()) {
		return false;
	}
	
	if (!options) {
		return true;
	}
	
	// Check calls_since constraint
	if (options.max_calls_ago != null) {
		if (this.calls_since_last > options.max_calls_ago) {
			return false;
		}
	}
	
	// Check time constraint
	if (options.max_seconds_ago != null) {
		let seconds_ago = (Date.now() - this.last_called_at) / 1000;
		if (seconds_ago > options.max_seconds_ago) {
			return false;
		}
	}
	
	return true;
});

/**
 * Get seconds since this tool was last called
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {number|null}   Seconds since last call, or null if never called
 */
ToolHistoryEntry.setMethod(function getSecondsSinceLastCall() {
	
	if (!this.last_called_at) {
		return null;
	}
	
	return Math.round((Date.now() - this.last_called_at) / 1000);
});

/**
 * Convert to a plain object (for serialization/debugging)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {Object}
 */
ToolHistoryEntry.setMethod(function toJSON() {
	return {
		call_count       : this.call_count,
		last_called_at   : this.last_called_at,
		calls_since_last : this.calls_since_last,
	};
});
