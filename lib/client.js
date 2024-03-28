/**
 * The Thoth Client class.
 * Also supports OpenAI-compatible endpoints.
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
const Client = Function.inherits('Thoth.Base', 'Thoth', function Client(options) {

	// The endpoint of the proteus server
	this.endpoint = options?.endpoint;

	if (!this.endpoint) {
		return;
	}

	if (!this.endpoint.endsWith('/')) {
		this.endpoint += '/';
	}

	// The client's slug (used in the url)
	this.client_slug = options.client_slug;

	// The thoth access key
	this.access_key = options.access_key;
});

/**
 * Create an agent pool with a very long timeout
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Client.setProperty('request_agent_pool', new Classes.Develry.AgentPool({
	maxSockets : 30,
	timeout    : 30 * 60 * 1000,
}));

/**
 * Create an OpenAI-compatible URL
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {string}   path
 *
 * @return   {RURL}
 */
Client.setMethod(function createOpenAiUrl(path) {

	let full_path = '/v1/';

	if (path[0] == '/') {
		path = path.slice(1);
	}

	full_path += path;

	return RURL.parse(full_path, this.endpoint);
});

/**
 * Do a remote request
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Client.setMethod(async function doRemote(mlm_slug, type, body) {

	let url = RURL.parse(this.endpoint + this.client_slug + '/' + mlm_slug + '/' + type);

	if (!body) {
		body = {};
	}

	let fetch_options = {
		agent_pool : this.request_agent_pool,
		url     : url,
		headers : {
			'access-key': this.access_key,
		},
		post : body,
		timeout : 30 * 60 * 1000,
	};

	let result = await Blast.fetch(fetch_options);

	// We trust the server to return JSON-Dry messages
	result = JSON.undry(result);

	return result;
});

/**
 * Generate text completion
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {string}          mlm_slug
 * @param    {string|Object}   prompt     Probably a string, but certain models accept objects
 * @param    {Object}          options
 */
Client.setMethod(async function generateTextCompletion(mlm_slug, prompt, options) {

	if (prompt == null) {
		throw new Error('Text to complete can not be null');
	}

	if (!mlm_slug || mlm_slug.length > 100) {
		throw new Error('Invalid MLM slug given');
	}

	if (!options) {
		options = {};
	}

	let payload = {
		prompt : prompt,
	};

	if (options.max_tokens) {
		payload.max_tokens = options.max_tokens;
	}

	return this.doRemote(mlm_slug, 'complete', payload);
});

/**
 * Generate completions
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}   options
 */
Client.setMethod(function generateCompletion(options) {

	if (!options?.model) {
		throw new Error('No model given');
	}

	if (!options?.messages?.length) {
		throw new Error('No messages given');
	}

	let enable_stream = options.stream;

	let data = {...options};

	let url = this.createOpenAiUrl('/chat/completions');

	let fetch_options = {
		agent_pool : this.request_agent_pool,
		url        : url,
		headers    : {
			'Content-Type' : 'application/json',
			'Authorization': 'Bearer ' + this.access_key,
		},
		post : data,
		timeout : 30 * 60 * 1000,
	};

	if (!enable_stream) {
		return Blast.fetch(fetch_options);
	}

	let events = new Blast.Classes.Develry.RequestEvents(fetch_options);
	let stream = new Classes.Stream.PassThrough({objectMode: true});
	let has_ended = false;

	console.log('Created events:', events);

	const endStream = () => {
		has_ended = true;
		stream.end();
	};

	events.on('message', message => {

		if (has_ended) {
			return;
		}

		let data = message.data;

		if (data == '[DONE]') {
			endStream();
			return;
		}

		try {
			data = JSON.parse(data);
			stream.write(data);
		} catch (err) {
			endStream();
			return;
		}
	});

	return stream;
});