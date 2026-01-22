/**
 * MCP Response Builder - fluent builder for MCP tool responses
 *
 * Usage:
 *   McpResponse.text('Hello')                    // Simple text response
 *   McpResponse.error('Something went wrong')    // Error response
 *   McpResponse.create()                         // Builder for complex responses
 *       .header('Results')
 *       .section('Items', 3)
 *       .bullet('First item')
 *       .bullet('Second item')
 *       .openTag('details', tag => {
 *           tag.line('Additional info here');
 *       })
 *       .summary('3 items found')
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
const McpResponse = Function.inherits('Thoth.Mcp.Base', 'Thoth.Mcp', function Response() {

	// The content array (MCP format)
	this.content = [];

	// Internal lines array for builder methods
	this._lines = [];

	// Tag stack for tracking open tags (entries: {name, indent})
	this._tag_stack = [];

	// Current indentation level
	this._indent = 0;

	// Whether this is an error response
	this.is_error = false;
});

/**
 * Getter for MCP-compatible isError property.
 * Returns true when error, undefined otherwise (matching MCP spec).
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
McpResponse.setProperty(function isError() {
	return this.is_error ? true : undefined;
}, function(value) {
	this.is_error = !!value;
});

/**
 * Create a new response builder
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {McpResponse}
 */
McpResponse.setStatic(function create() {
	return new McpResponse();
});

/**
 * Create a simple text response
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   message
 *
 * @return   {McpResponse}
 */
McpResponse.setStatic(function text(message) {
	return new McpResponse().addText(message);
});

/**
 * Create an error response
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   message
 *
 * @return   {McpResponse}
 */
McpResponse.setStatic(function error(message) {
	return new McpResponse().addText(message).asError();
});

/**
 * Convert a value to McpResponse.
 * Handles: McpResponse, MCP format objects, strings, other objects
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {*}   value
 *
 * @return   {McpResponse}
 */
McpResponse.setStatic(function from(value) {
	
	// Already an McpResponse
	if (value instanceof McpResponse) {
		return value;
	}
	
	// MCP format object with content array
	if (value && Array.isArray(value.content)) {
		let response = new McpResponse();
		response.content = value.content;
		
		if (value.isError) {
			response.is_error = true;
		}
		
		return response;
	}
	
	// String - simple text response
	if (typeof value === 'string') {
		return McpResponse.text(value);
	}
	
	// Null/undefined
	if (value === null || value === undefined) {
		return McpResponse.text('null');
	}
	
	// Object - format as JSON
	let response = new McpResponse();
	return response.addObject(value);
});

/**
 * Add text content
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   text
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function addText(text) {
	this.content.push({
		type : 'text',
		text : String(text),
	});
	return this;
});

/**
 * Add another response's content to this one.
 * Accepts McpResponse, MCP format objects, strings, or other values.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {*}   value
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function add(value) {
	
	let other = McpResponse.from(value);
	
	// Merge content arrays
	this.content.push(...other.content);
	
	// Propagate error status if the added response is an error
	if (other.is_error) {
		this.is_error = true;
	}
	
	return this;
});

/**
 * Add an object as formatted JSON text
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}   obj
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function addObject(obj) {
	
	let text;
	
	if (obj === null || obj === undefined) {
		text = 'null';
	} else if (typeof obj.toJSON === 'function') {
		text = JSON.stringify(obj.toJSON(), null, 2);
	} else {
		try {
			text = JSON.stringify(obj, null, 2);
		} catch (err) {
			text = '[Object - could not stringify]';
		}
	}
	
	return this.addText(text);
});

/**
 * Mark this response as an error
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function asError() {
	this.is_error = true;
	return this;
});

/**
 * Prepend text to the first text content item (or add new one at start)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   text
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function prependText(text) {
	
	let first_text = this.content.find(c => c.type === 'text');
	
	if (first_text) {
		first_text.text = text + first_text.text;
	} else {
		this.content.unshift({
			type : 'text',
			text : String(text),
		});
	}
	
	return this;
});

/**
 * Append text to the last text content item (or add new one at end)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   text
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function appendText(text) {
	
	let last_text = this.content.findLast(c => c.type === 'text');
	
	if (last_text) {
		last_text.text += text;
	} else {
		this.content.push({
			type : 'text',
			text : String(text),
		});
	}
	
	return this;
});

/**
 * Get indentation string for current level
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {number}   level   Optional override for indent level
 *
 * @return   {string}
 */
McpResponse.setMethod(function _getIndent(level) {
	
	if (level === undefined) {
		level = this._indent;
	}
	
	return '  '.repeat(level);
});

/**
 * Add a line to the internal lines array with current indentation
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   text
 * @param    {number}   indent_override   Optional indent level override
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function _addLine(text, indent_override) {
	
	let indent = this._getIndent(indent_override);
	
	this._lines.push(indent + text);
	
	return this;
});

/**
 * Add a header line (# Title)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   text
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function header(text) {
	return this._addLine('# ' + text);
});

/**
 * Add a subheader line (## Title)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   text
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function subheader(text) {
	return this._addLine('## ' + text);
});

/**
 * Add a section title (Title (count):)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   title
 * @param    {number}   count   Optional count to display
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function section(title, count) {
	
	let line = title;
	
	if (count !== undefined) {
		line += ` (${count})`;
	}
	
	line += ':';
	
	return this._addLine(line);
});

/**
 * Add a bullet point (• text)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   text
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function bullet(text) {
	return this._addLine('• ' + text);
});

/**
 * Add a plain line of text
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   text
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function line(text) {
	return this._addLine(text);
});

/**
 * Add a blank line
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function blank() {
	this._lines.push('');
	return this;
});

/**
 * Add a summary line (typically at the end)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   text
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function summary(text) {
	return this._addLine(text);
});

/**
 * Increase indentation level
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function indent() {
	this._indent++;
	return this;
});

/**
 * Decrease indentation level
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function dedent() {
	this._indent = Math.max(0, this._indent - 1);
	return this;
});

/**
 * Open an XML-like tag.
 * Can be auto-closed by providing content (callback or McpResponse).
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}            name      Tag name
 * @param    {Function|McpResponse}   content   Optional callback or response to auto-wrap
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function openTag(name, content) {
	
	// Store current indent level with the tag
	let entry = {
		name   : name,
		indent : this._indent,
	};
	
	this._tag_stack.push(entry);
	
	// Add opening tag at current indent
	this._addLine(`<${name}>`);
	
	// If content provided, add it and auto-close
	if (content !== undefined) {
		if (typeof content === 'function') {
			// Callback style: openTag('name', tag => { tag.line(...) })
			content(this);
		} else if (content instanceof McpResponse) {
			// Merge another response's lines
			this._mergeResponse(content);
		} else {
			// Treat as plain text
			this.line(String(content));
		}
		
		// Auto-close the tag
		this.closeTag(name);
	}
	
	return this;
});

/**
 * Close an XML-like tag.
 * Restores indent level to what it was when the tag was opened.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   name   Optional tag name (validates it's the most recent)
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function closeTag(name) {
	
	if (this._tag_stack.length === 0) {
		throw new Error('McpResponse: No open tags to close');
	}
	
	let last_entry = this._tag_stack[this._tag_stack.length - 1];
	
	// If name provided, validate it matches the most recent tag
	if (name && last_entry.name !== name) {
		throw new Error(`McpResponse: Cannot close tag "${name}" - tag "${last_entry.name}" must be closed first (LIFO order)`);
	}
	
	// Pop the tag entry
	let entry = this._tag_stack.pop();
	
	// Restore indent to the tag's original level
	this._indent = entry.indent;
	
	// Add closing tag at the restored indent level
	this._addLine(`</${entry.name}>`);
	
	return this;
});

/**
 * Merge another McpResponse's lines into this one.
 * Used internally for openTag with response content.
 * 
 * Lines are merged as-is, preserving the source response's internal
 * indentation structure. The caller (openTag) handles the tag indentation.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {McpResponse}   other
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function _mergeResponse(other) {
	
	// Merge lines as-is (internal indentation is already correct)
	for (let line of other._lines) {
		this._lines.push(line);
	}
	
	// Propagate error status
	if (other.is_error) {
		this.is_error = true;
	}
	
	return this;
});

/**
 * Finalize the response: move _lines to content and validate tags.
 * Called automatically by toJSON() and toString().
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {McpResponse}   this (for chaining)
 */
McpResponse.setMethod(function _finalize() {
	
	// Check for unclosed tags
	if (this._tag_stack.length > 0) {
		let unclosed = this._tag_stack.map(e => e.name).join(', ');
		throw new Error(`McpResponse: Unclosed tags: ${unclosed}. All tags opened with openTag() must be closed with closeTag().`);
	}
	
	// Move accumulated lines to content
	if (this._lines.length > 0) {
		this.content.push({
			type : 'text',
			text : this._lines.join('\n'),
		});
		// Clear the array (don't reassign - prepareProperty makes reference read-only)
		this._lines.length = 0;
	}
	
	return this;
});

/**
 * Convert to string (all text content joined)
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {string}
 */
McpResponse.setMethod(function toString() {
	
	// Finalize first
	this._finalize();
	
	// Get all text content
	let text_parts = this.content
		.filter(c => c.type === 'text')
		.map(c => c.text);
	
	return text_parts.join('\n');
});

/**
 * Convert to MCP format.
 * Also used by JSON.stringify() automatically.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {Object}
 */
McpResponse.setMethod(function toJSON() {
	
	// Finalize builder content first
	this._finalize();
	
	let result = {
		content: this.content,
	};
	
	if (this.is_error) {
		result.isError = true;
	}
	
	return result;
});
