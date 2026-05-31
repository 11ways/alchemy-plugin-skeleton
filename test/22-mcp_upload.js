/* istanbul ignore file */
const assert = require('assert');
const libfs = require('fs');
const libos = require('os');
const libpath = require('path');
const { getMcpUrl, mcpRequestAsync, initializeSession, callTool } = require('./helpers');

/**
 * Tests for the generic file-upload feature (request_upload_path + the
 * upload endpoint + the upload-slot lifecycle on the manager + the
 * local-file/SSRF download guard).
 */
describe('MCP file uploads', function() {

	let manager;
	let a_tool;

	function makeSession() {
		return new Classes.Thoth.Mcp.Session();
	}

	before(function() {
		manager = alchemy.plugins.thoth.getMcpServer('test').manager;
		// Any tool instance carries the shared assertDownloadAllowed method.
		a_tool = manager.tools.values().next().value;
	});

	describe('Upload slot lifecycle (manager)', function() {

		it('creates a slot with a secret token and a readable reference', function() {
			let session = makeSession();
			let slot = manager.createUploadSlot(session, {filename: 'wanted.pdf'});

			assert.ok(slot.token && slot.token.length >= 12, 'token should be a non-trivial secret');
			assert.strictEqual(slot.reference, 'U001', 'first reference should be U001');
			assert.strictEqual(slot.uploaded, false);
			assert.strictEqual(slot.used, false);

			// Indexed by token on the manager, by reference on the session.
			assert.strictEqual(manager.getUploadSlot(slot.token), slot, 'resolvable by token');
			assert.strictEqual(session.upload_slots.get('U001'), slot, 'resolvable by reference on session');

			// References increment per-session.
			let slot2 = manager.createUploadSlot(session, {});
			assert.strictEqual(slot2.reference, 'U002');
		});

		it('stores an uploaded file and makes it consumable (single-use)', async function() {
			let session = makeSession();
			let slot = manager.createUploadSlot(session, {filename: 'wanted.txt'});

			// Fake an uploaded multipart file.
			let src = libpath.join(libos.tmpdir(), 'thoth-upload-src-' + slot.token + '.txt');
			libfs.writeFileSync(src, 'hello upload');
			let file = {path: src, name: 'original.txt', type: 'text/plain'};

			await manager.storeUpload(slot, file);

			assert.ok(slot.uploaded, 'slot should be marked uploaded');
			assert.ok(slot.temp_path && libfs.existsSync(slot.temp_path), 'temp file should exist');
			assert.strictEqual(slot.size, 12, 'size should match the bytes written');
			assert.strictEqual(slot.original_filename, 'original.txt');
			assert.ok(!libfs.existsSync(src), 'the source temp file should have been moved');

			let info = manager.consumeUploadSlot(session, 'U001');
			assert.strictEqual(info.temp_path, slot.temp_path);
			assert.strictEqual(info.filename, 'wanted.txt', 'requested filename should win over the uploaded name');
			assert.strictEqual(info.mimetype, 'text/plain');

			// Single-use.
			assert.throws(() => manager.consumeUploadSlot(session, 'U001'), /already been used/);

			// Cleanup
			manager.deleteUploadSlot(slot);
		});

		it('rejects a reference from a different session', async function() {
			let session_a = makeSession();
			let session_b = makeSession();
			let slot = manager.createUploadSlot(session_a, {});

			let src = libpath.join(libos.tmpdir(), 'thoth-upload-x-' + slot.token + '.txt');
			libfs.writeFileSync(src, 'x');
			await manager.storeUpload(slot, {path: src, name: 'x.txt', type: 'text/plain'});

			// session_b has no U001 of its own.
			assert.throws(() => manager.consumeUploadSlot(session_b, 'U001'), /Unknown upload reference/);

			manager.deleteUploadSlot(slot);
		});

		it('refuses to consume an unuploaded or expired slot', function() {
			let session = makeSession();
			let slot = manager.createUploadSlot(session, {});

			// Not uploaded yet.
			assert.throws(() => manager.consumeUploadSlot(session, slot.reference), /not been uploaded|yet/i);

			// Force expiry.
			slot.expires_at = Date.now() - 1;
			assert.strictEqual(manager.getUploadSlot(slot.token), null, 'expired slot not resolvable by token');
		});
	});

	describe('Download guard (assertDownloadAllowed)', function() {

		it('allows public http(s) URLs', function() {
			assert.strictEqual(
				a_tool.assertDownloadAllowed('https://example.com/timesheets.pdf'),
				'https://example.com/timesheets.pdf'
			);
		});

		it('rejects file://, non-http schemes and private/loopback hosts by default', function() {
			assert.throws(() => a_tool.assertDownloadAllowed('file:///etc/passwd'), /local file access/i);
			assert.throws(() => a_tool.assertDownloadAllowed('ftp://example.com/x'), /http/i);
			assert.throws(() => a_tool.assertDownloadAllowed('http://localhost/x'), /local\/private/i);
			assert.throws(() => a_tool.assertDownloadAllowed('http://127.0.0.1/x'), /local\/private/i);
			assert.throws(() => a_tool.assertDownloadAllowed('http://192.168.1.10/x'), /local\/private/i);
			assert.throws(() => a_tool.assertDownloadAllowed('http://10.0.0.5/x'), /local\/private/i);
		});

		it('permits local access when the setting is enabled', function() {
			let original = alchemy.settings.plugins.thoth.allow_local_file_access;
			alchemy.settings.plugins.thoth.allow_local_file_access = true;

			try {
				assert.strictEqual(
					a_tool.assertDownloadAllowed('file:///etc/hostname'),
					'file:///etc/hostname'
				);
			} finally {
				alchemy.settings.plugins.thoth.allow_local_file_access = original;
			}
		});
	});

	describe('HTTP flow (request_upload_path + upload endpoint)', function() {

		let mcp_url;
		let session_id;

		before(async function() {
			this.timeout(15000);
			mcp_url = getMcpUrl('test');
			session_id = await initializeSession(mcp_url, 'upload-test');
		});

		it('request_upload_path returns a reference and an upload_url', async function() {
			let result = await callTool(mcp_url, session_id, 'request_upload_path', {filename: 'timesheets.pdf'});

			assert.ok(!result.error, 'should not error');
			let text = result.result.content[0].text;

			assert.ok(/reference:\s*U\d+/.test(text), 'should include a U### reference:\n' + text);
			assert.ok(/upload_url:\s*\S+\/upload\//.test(text), 'should include an upload_url:\n' + text);
		});

		it('accepts a real multipart upload and the slot becomes consumable', async function() {
			this.timeout(15000);

			let result = await callTool(mcp_url, session_id, 'request_upload_path', {});
			let text = result.result.content[0].text;

			let reference = text.match(/reference:\s*(U\d+)/)[1];
			let upload_url = text.match(/upload_url:\s*(\S+)/)[1];

			// Upload using the global fetch + FormData (Node 18+).
			let form = new FormData();
			form.append('file', new Blob(['timesheet bytes'], {type: 'text/plain'}), 'sheet.txt');

			let res = await fetch(upload_url, {method: 'POST', body: form});
			let body = await res.json();

			assert.ok(body.ok, 'upload should succeed: ' + JSON.stringify(body));
			assert.strictEqual(body.reference, reference);
			assert.strictEqual(body.size, 'timesheet bytes'.length);

			// The slot on the session should now be consumable.
			let session = manager.sessions.get(session_id);
			let info = manager.consumeUploadSlot(session, reference);
			assert.ok(info.temp_path && libfs.existsSync(info.temp_path), 'consumed temp file should exist');
			assert.strictEqual(info.mimetype, 'text/plain');

			// Cleanup the temp file.
			libfs.unlinkSync(info.temp_path);
		});

		it('rejects an upload to an unknown token', async function() {
			let res = await fetch(getMcpUrl('test').replace(/\/mcp$/, '') + '/mcp/upload/deadbeefdeadbeef', {
				method: 'POST',
				body: (() => { let f = new FormData(); f.append('file', new Blob(['x']), 'x.txt'); return f; })(),
			});
			assert.strictEqual(res.status, 404, 'unknown token should 404');
		});
	});
});
