/**
 * The base Thoth.Mcp.Error class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   message
 */
const McpError = Function.inherits('Alchemy.Error', 'Thoth.Mcp.Error', 'Error');

/**
 * The error code for programmatic handling
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @type     {string}
 */
McpError.setProperty('code', 'MCP_ERROR');

/**
 * Get the properties to serialize
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @type     {Array}
 */
McpError.setProperty(function properties_to_serialize() {
	return ['code', 'message', 'stack'];
});

/**
 * Return string interpretation of this error
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {string}
 */
McpError.setMethod(function toString() {
	let result = this.name + ' Error';

	if (this.code) {
		result += ' [' + this.code + ']';
	}

	if (this.message) {
		result += ': ' + this.message;
	}

	return result;
});
