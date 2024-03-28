/**
 * ThothAction model:
 * A single action that can be performed by a MLM
 *
 * @constructor
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}    options
 */
const ThothAction = Function.inherits('Alchemy.Model.Thoth.Base', 'Action');

/**
 * Constitute the class wide schema
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ThothAction.constitute(function addFields() {

	this.addField('title', 'String', {
		description : 'The title of this action',
	});

	this.belongsTo('ThothMlm', 'Thoth.Mlm', {
		description: 'The MLM that should be used to perform this action',
	});

	this.addField('response_type', 'Enum', {
		description : 'In what format the response should be',
		values: {
			text : 'Text',
			json : 'JSON',
		}
	});

	this.addField('system_prompt', 'Text', {
		description : 'The system prompt for this action',
	});

	let message_schema = alchemy.createSchema();

	message_schema.addField('role', 'Enum', {
		values: {
			'user': 'User',
			'system': 'System',
			'assistant': 'Assistant',
		}
	});

	message_schema.addField('text', 'Text', {
		description: 'The message text',
	});

	this.addField('messages', message_schema, {
		description: 'The multishot example messages to add',
		array: true,
	});

	this.addField('wrapper', 'Text', {
		description : 'The wrapper to use for all user messages. Use {{text}} to insert the message',
	});

	this.addField('max_output_tokens', 'Integer', {
		description : 'The maximum amount of allowed output tokens',
	});

	this.addBehaviour('Sluggable');
});

/**
 * Configure chimera for this model
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ThothAction.constitute(function chimeraConfig() {

	if (!this.chimera) {
		return;
	}

	// Get the list group
	const list = this.chimera.getActionFields('list');

	list.addField('title');
	list.addField('ThothMlm');
	list.addField('response_type');

	// Get the edit group
	const edit = this.chimera.getActionFields('edit');
	
	edit.addField('title');
	edit.addField('thoth_mlm_id');
	edit.addField('response_type');
	edit.addField('system_prompt');
	edit.addField('messages');
	edit.addField('wrapper');
	edit.addField('max_output_tokens');
	edit.addField('slug');
});

/**
 * Perform the action
 *
 * @author   Jelle De Loecker <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ThothAction.setDocumentMethod(async function performAction(data) {

	await this.populate('ThothMlm');

	if (!this.ThothMlm) {
		throw new Error('No MLM is configured for action "' + this.title + '"');
	}

	const client = alchemy.plugins.thoth?.client_instance;

	if (!client) {
		throw new Error('No Thoth client is configured');
	}

	let system_prompt = this.system_prompt;

	if (system_prompt) {
		system_prompt = system_prompt.trim();
	}

	let response_format = 'text';

	if (this.response_type == 'json') {
		if (system_prompt) {
			system_prompt += '\n';
		} else {
			system_prompt = '';
		}

		system_prompt += 'Respond using JSON format';
		response_format = 'json_object';
	}

	let messages = [{role: 'system', content: system_prompt}];

	if (this.messages?.length) {
		for (let entry of this.messages) {
			if (entry.role == 'assistant') {
				messages.push({role: 'assistant', content: entry.text});
				continue;
			}

			if (entry.role == 'system') {
				messages.push({role: 'system', content: entry.text});
				continue;
			}

			if (entry.role != 'user') {
				continue;
			}

			let content = entry.text || '';

			if (this.wrapper) {
				content = this.wrapper.replaceAll('{{text}}', content);
			}

			messages.push({role: 'user', content: content});
		}
	}

	if (typeof data == 'string') {
		if (this.wrapper) {
			data = this.wrapper.replaceAll('{{text}}', data);
		}

		messages.push({role: 'user', content: data});
	}

	let result = await client.generateCompletion({
		model : this.ThothMlm.thoth_slug,
		messages,
		response_format,
		max_tokens : this.max_output_tokens || 2500,
	});

	let choice = result?.choices?.[0]?.message?.content;

	console.log('RESULT:', result, 'choice:', choice);

	if (!choice) {
		return null;
	}

	if (this.response_type == 'json') {
		if (typeof choice == 'object') {
			return choice;
		}

		try {
			return JSON.parse(choice);
		} catch (err) {
			choice = choice.trim();

			// Something went wrong, maybe it responded with a markdown
			// escaped json
			if (choice.startsWith('```')) {
				let lines = choice.split('\n');

				// Only get the middle lines
				lines = lines.slice(1, -1);

				choice = lines.join('\n');

				console.log('Parsing again:', choice)

				return JSON.parse(choice);
			}

			throw err;
		}
	}

	return choice;
});