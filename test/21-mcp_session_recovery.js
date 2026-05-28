/* istanbul ignore file */
const assert = require('assert');
const { getMcpUrl } = require('./helpers');

/**
 * Regression test for the session auto-recreation bug.
 *
 * When a request arrives with a session id the server doesn't know about
 * (e.g. a client reconnecting after a server restart) plus a valid API
 * key, the manager auto-creates a fresh session bound to that key. The
 * bug: the auto-create (and DB-restore) paths set `user_id` but never
 * loaded the `user` document, so `conduit.session('UserData')` was empty
 * and EVERY permission check failed - even though the key was valid and
 * its user was authorized.
 *
 * This drives that exact path over HTTP: a permission-gated tool
 * (`admin_info`, requires `thoth.admin`) called with a valid key but a
 * never-seen session id. It must succeed, not be denied.
 */
describe('MCP session auto-recreation (permission regression)', function() {

	let auth_url;
	let raw_key;

	/**
	 * Make a raw JSON-RPC POST with both an API key and an explicit
	 * (here: deliberately unknown) session id. `mcpRequestAsync` in
	 * helpers can't set Authorization, so we do it directly.
	 */
	function rpcWithAuth(url, request, session_id, api_key) {
		return new Promise((resolve, reject) => {
			Blast.fetch(url, {
				method  : 'POST',
				headers : {
					'Content-Type'  : 'application/json',
					'Accept'        : 'application/json, text/event-stream',
					'Authorization' : 'Bearer ' + api_key,
					'Mcp-Session-Id': session_id,
				},
				body: JSON.stringify(request),
			}, (err, res, body) => {
				if (err) return reject(err);

				let result;
				try {
					if (typeof body === 'string' && body.startsWith('event:')) {
						// Minimal SSE extraction
						let line = body.split('\n').find(l => l.startsWith('data:'));
						result = line ? JSON.parse(line.slice(5).trim()) : null;
					} else {
						result = typeof body === 'string' ? JSON.parse(body) : body;
					}
				} catch (e) {
					return reject(e);
				}

				resolve({ result, response: res });
			});
		});
	}

	before(async function() {
		this.timeout(15000);

		auth_url = getMcpUrl('auth');

		// A user that genuinely holds the gated permission. The fix makes
		// the auto-created session load THIS user, so the permission check
		// (which reads conduit.session('UserData')) passes.
		let User = Model.get('User');
		let admin_user = User.createDocument({
			username    : 'mcp-recovery-admin',
			permissions : [{ permission: 'thoth.admin', value: true }],
		});
		await admin_user.save();

		// An API key bound to that user (auth lives entirely in the key,
		// which is sent on every request - no session needed for identity).
		let McpApiKey = Model.get('Thoth_McpApiKey');
		let key_doc = McpApiKey.createDocument({
			name            : 'Recovery Regression Key',
			is_active       : true,
			user_id         : admin_user.$pk,
			allowed_servers : ['auth'],
		});
		raw_key = key_doc.generateKey();
		await key_doc.save();
	});

	it('authorizes a permission-gated tool on a session auto-created from the API key', async function() {
		this.timeout(15000);

		// A session id the server has never issued - simulates a client
		// reusing a session id after the server restarted (sessions are
		// in-memory, so the server has no record of it).
		let stale_session_id = 'staleafterrestart0000000000000000';

		let { result } = await rpcWithAuth(auth_url, {
			jsonrpc : '2.0',
			id      : 1,
			method  : 'tools/call',
			params  : { name: 'admin_info', arguments: {} },
		}, stale_session_id, raw_key);

		assert.ok(result, 'expected a JSON-RPC response');

		// The bug surfaced as a JSON-RPC error / permission denial. Assert
		// we did NOT get denied.
		let denied = (result.error && /permission|denied/i.test(JSON.stringify(result.error)))
			|| (result.result?.content && /permission denied/i.test(JSON.stringify(result.result.content)));

		assert.ok(!denied, 'permission-gated tool must NOT be denied on an auto-recreated session, got:\n'
			+ JSON.stringify(result, null, 2));

		// And it should actually have run.
		let text = JSON.stringify(result.result || result);
		assert.ok(/admin access/i.test(text),
			'expected admin_info to execute (\"admin access\"), got:\n' + text);
	});
});
