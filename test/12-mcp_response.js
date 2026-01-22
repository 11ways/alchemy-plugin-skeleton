var assert = require('assert');

describe('MCP Response', function() {

	let McpResponse;

	before(function() {
		McpResponse = Classes.Thoth?.Mcp?.Response;

		if (!McpResponse) {
			throw new Error('Thoth.Mcp.Response class not found');
		}
	});

	describe('Static factory methods', function() {

		it('should create a simple text response', function() {
			let response = McpResponse.text('Hello world');
			let result = response.toJSON();

			assert.strictEqual(result.content.length, 1);
			assert.strictEqual(result.content[0].type, 'text');
			assert.strictEqual(result.content[0].text, 'Hello world');
			assert.strictEqual(result.isError, undefined);
		});

		it('should create an error response', function() {
			let response = McpResponse.error('Something went wrong');
			let result = response.toJSON();

			assert.strictEqual(result.content[0].text, 'Something went wrong');
			assert.strictEqual(result.isError, true);
		});

		it('should create empty builder with create()', function() {
			let response = McpResponse.create();
			assert.ok(response instanceof McpResponse);
		});
	});

	describe('Builder methods', function() {

		it('should add a header', function() {
			let response = McpResponse.create()
				.header('My Title');

			assert.strictEqual(response.toString(), '# My Title');
		});

		it('should add a subheader', function() {
			let response = McpResponse.create()
				.subheader('Section');

			assert.strictEqual(response.toString(), '## Section');
		});

		it('should add a section with count', function() {
			let response = McpResponse.create()
				.section('Items', 5);

			assert.strictEqual(response.toString(), 'Items (5):');
		});

		it('should add a section without count', function() {
			let response = McpResponse.create()
				.section('Details');

			assert.strictEqual(response.toString(), 'Details:');
		});

		it('should add bullets', function() {
			let response = McpResponse.create()
				.bullet('First item')
				.bullet('Second item');

			assert.strictEqual(response.toString(), '• First item\n• Second item');
		});

		it('should add plain lines', function() {
			let response = McpResponse.create()
				.line('Line one')
				.line('Line two');

			assert.strictEqual(response.toString(), 'Line one\nLine two');
		});

		it('should add blank lines', function() {
			let response = McpResponse.create()
				.line('Before')
				.blank()
				.line('After');

			assert.strictEqual(response.toString(), 'Before\n\nAfter');
		});

		it('should add summary', function() {
			let response = McpResponse.create()
				.summary('Total: 5 items');

			assert.strictEqual(response.toString(), 'Total: 5 items');
		});
	});

	describe('Indentation', function() {

		it('should indent content', function() {
			let response = McpResponse.create()
				.line('Level 0')
				.indent()
				.line('Level 1')
				.indent()
				.line('Level 2');

			assert.strictEqual(response.toString(), 'Level 0\n  Level 1\n    Level 2');
		});

		it('should dedent content', function() {
			let response = McpResponse.create()
				.indent()
				.indent()
				.line('Deep')
				.dedent()
				.line('Less deep')
				.dedent()
				.line('Surface');

			assert.strictEqual(response.toString(), '    Deep\n  Less deep\nSurface');
		});

		it('should not go below indent level 0', function() {
			let response = McpResponse.create()
				.dedent()
				.dedent()
				.dedent()
				.line('Still at level 0');

			assert.strictEqual(response.toString(), 'Still at level 0');
		});

		it('should indent bullets', function() {
			let response = McpResponse.create()
				.section('Items')
				.indent()
				.bullet('Item 1')
				.bullet('Item 2');

			assert.strictEqual(response.toString(), 'Items:\n  • Item 1\n  • Item 2');
		});
	});

	describe('Tags - manual open/close', function() {

		it('should open and close tags', function() {
			let response = McpResponse.create()
				.openTag('data')
				.line('Content inside')
				.closeTag();

			assert.strictEqual(response.toString(), '<data>\nContent inside\n</data>');
		});

		it('should validate tag name on close', function() {
			let response = McpResponse.create()
				.openTag('outer')
				.openTag('inner');

			// Try to close outer before inner - should throw
			assert.throws(() => {
				response.closeTag('outer');
			}, /must be closed first/);
		});

		it('should throw when no tags to close', function() {
			let response = McpResponse.create()
				.line('No tags');

			assert.throws(() => {
				response.closeTag();
			}, /No open tags to close/);
		});

		it('should throw on unclosed tags at finalize', function() {
			let response = McpResponse.create()
				.openTag('unclosed')
				.line('Content');

			assert.throws(() => {
				response.toString();
			}, /Unclosed tags: unclosed/);
		});

		it('should restore indent level when closing tag', function() {
			let response = McpResponse.create()
				.indent()
				.line('Indented')
				.openTag('tag')
				.indent()
				.indent()
				.line('Deeply indented')
				.closeTag()
				.line('Back to original indent');

			let output = response.toString();
			let lines = output.split('\n');

			// "Indented" should have 2 spaces
			assert.ok(lines[0].startsWith('  '), 'First line should be indented');
			// "Back to original indent" should also have 2 spaces (restored)
			assert.ok(lines[lines.length - 1].startsWith('  '), 'Last line should have restored indent');
		});
	});

	describe('Tags - auto-close with callback', function() {

		it('should auto-close tag after callback', function() {
			let response = McpResponse.create()
				.openTag('wrapper', tag => {
					tag.line('Inside callback');
				})
				.line('Outside');

			assert.strictEqual(response.toString(), '<wrapper>\nInside callback\n</wrapper>\nOutside');
		});

		it('should allow nested callbacks', function() {
			let response = McpResponse.create()
				.openTag('outer', tag => {
					tag.line('Outer content');
					tag.openTag('inner', inner => {
						inner.line('Inner content');
					});
				});

			let expected = '<outer>\nOuter content\n<inner>\nInner content\n</inner>\n</outer>';
			assert.strictEqual(response.toString(), expected);
		});

		it('should maintain indent inside callback', function() {
			let response = McpResponse.create()
				.openTag('items', tag => {
					tag.indent();
					tag.bullet('Item 1');
					tag.bullet('Item 2');
				});

			let output = response.toString();
			assert.ok(output.includes('  • Item 1'), 'Items should be indented');
		});
	});

	describe('Tags - auto-close with McpResponse', function() {

		it('should merge another response into tag', function() {
			let inner = McpResponse.create()
				.bullet('A')
				.bullet('B');

			let response = McpResponse.create()
				.openTag('items', inner);

			assert.strictEqual(response.toString(), '<items>\n• A\n• B\n</items>');
		});

		it('should preserve internal structure of merged response', function() {
			let inner = McpResponse.create()
				.section('Nested')
				.indent()
				.bullet('Item');

			let response = McpResponse.create()
				.openTag('wrapper', inner);

			let output = response.toString();
			assert.ok(output.includes('Nested:'), 'Should have section');
			assert.ok(output.includes('  • Item'), 'Should preserve internal indentation');
		});

		it('should propagate error status from merged response', function() {
			let errorResponse = McpResponse.create()
				.line('Error occurred')
				.asError();

			let response = McpResponse.create()
				.openTag('result', errorResponse);

			assert.strictEqual(response.is_error, true);
		});
	});

	describe('Tags - auto-close with plain text', function() {

		it('should wrap plain text in tag', function() {
			let response = McpResponse.create()
				.openTag('note', 'This is a note');

			assert.strictEqual(response.toString(), '<note>\nThis is a note\n</note>');
		});
	});

	describe('Complex builder patterns', function() {

		it('should build typical tool output', function() {
			let response = McpResponse.create()
				.header('Team Availability for Monday')
				.blank()
				.section('Working', 3)
				.bullet('Alice - Home Office')
				.bullet('Bob - Headquarters')
				.bullet('Charlie - Remote')
				.blank()
				.section('On Time-Off', 1)
				.bullet('Dave - Vacation')
				.blank()
				.summary('3 working, 1 off');

			let output = response.toString();

			assert.ok(output.includes('# Team Availability'));
			assert.ok(output.includes('Working (3):'));
			assert.ok(output.includes('• Alice - Home Office'));
			assert.ok(output.includes('On Time-Off (1):'));
			assert.ok(output.includes('3 working, 1 off'));
		});

		it('should build output with tagged sections', function() {
			let response = McpResponse.create()
				.header('Results')
				.openTag('employees', tag => {
					tag.bullet('alice');
					tag.bullet('bob');
				})
				.openTag('warnings', tag => {
					tag.line('High absence rate');
				});

			let output = response.toString();

			assert.ok(output.includes('<employees>'));
			assert.ok(output.includes('</employees>'));
			assert.ok(output.includes('<warnings>'));
			assert.ok(output.includes('</warnings>'));
		});

		it('should support mixed builder and direct addText', function() {
			let response = McpResponse.create()
				.header('Header')
				.bullet('Item');

			// Can still use addText after builder methods
			response.addText('\n\nDirect text');

			let result = response.toJSON();

			// Should have finalized builder content + direct text
			assert.ok(result.content.length >= 1);
		});
	});

	describe('toJSON integration', function() {

		it('should finalize builder content on toJSON', function() {
			let response = McpResponse.create()
				.header('Title')
				.bullet('Item');

			let result = response.toJSON();

			assert.strictEqual(result.content.length, 1);
			assert.strictEqual(result.content[0].type, 'text');
			assert.ok(result.content[0].text.includes('# Title'));
			assert.ok(result.content[0].text.includes('• Item'));
		});

		it('should throw on unclosed tags in toJSON', function() {
			let response = McpResponse.create()
				.openTag('open');

			assert.throws(() => {
				response.toJSON();
			}, /Unclosed tags/);
		});
	});

	describe('Chaining', function() {

		it('should support full fluent chaining', function() {
			// This should all compile and work
			let response = McpResponse.create()
				.header('Title')
				.subheader('Subtitle')
				.section('Items', 2)
				.indent()
				.bullet('A')
				.bullet('B')
				.dedent()
				.blank()
				.openTag('notes', tag => {
					tag.line('Note 1');
				})
				.summary('Done');

			assert.ok(response instanceof McpResponse);
			// Should not throw
			response.toString();
		});
	});
});
