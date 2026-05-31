/**
 * Generic file-upload tools for MCP servers.
 *
 * An MCP server opts in to file uploads simply by adding 'UploadTools' to its
 * `tool_classes`. The flow is:
 *   1. The LLM calls `request_upload_path` -> gets a readable `reference`
 *      (e.g. U001) plus an `upload_url` containing a secret token.
 *   2. The LLM uploads the bytes with a plain `curl -F "file=@..."` to the
 *      upload_url (no MCP session needed - the token is the credential).
 *   3. The LLM passes the `reference` to an app-specific tool, which consumes
 *      the ephemeral upload (e.g. turns it into a MediaFile).
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.2
 */
const UploadTools = Function.inherits('Thoth.Mcp.Tools', 'UploadTools');

/**
 * Request a temporary, session-scoped upload path.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.2
 */
UploadTools.addTool('request_upload_path', {
	description : 'Get a temporary upload URL to send a file to this server. Returns a readable reference (e.g. "U001") and an upload_url. Upload the file with: curl -F "file=@/path/to/file" <upload_url>. Then pass the reference to the tool that accepts an uploaded file. The path expires after 15 minutes and is single-use.',
}, function schema() {

	this.addParameter('filename', 'String', {
		mcp_description : 'Optional suggested filename for the upload (e.g. timesheets.pdf)',
	});

}, async function execute(conduit, params) {

	const McpError = Classes.Thoth.Mcp.Error;

	let server = conduit.mcp_server;
	let manager = server?.manager;
	let session = conduit.mcp_session;

	if (!manager || !session) {
		throw new McpError('No active MCP session - cannot create an upload path.');
	}

	let slot = manager.createUploadSlot(session, {
		filename : params.filename,
	});

	// Build an absolute upload URL. Prefer the configured public URL, then the
	// current request's origin, then a localhost fallback.
	let origin = alchemy.settings?.network?.main_url;

	if (!origin && conduit.url?.protocol && conduit.url?.host) {
		origin = conduit.url.protocol + '//' + conduit.url.host;
	}

	if (!origin) {
		origin = 'http://localhost:' + (alchemy.settings?.network?.port || '');
	}

	origin = String(origin).replace(/\/+$/, '');

	let upload_url = origin + server.path + '/upload/' + slot.token;

	let response = this.createResponse()
		.header('Upload path ready')
		.line('reference: ' + slot.reference)
		.line('upload_url: ' + upload_url)
		.line('expires_in: 900 (15 minutes, single-use)')
		.blank()
		.line('Upload the file with this command:')
		.line('curl -F "file=@/path/to/file" ' + upload_url)
		.blank()
		.line('Then pass reference "' + slot.reference + '" to the tool that accepts an uploaded file.');

	return response;
});
