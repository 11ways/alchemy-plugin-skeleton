/**
 * ThothMlm model:
 * An MLM model we can use remotely
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}    options
 */
const ThothMlm = Function.inherits('Alchemy.Model.Thoth.Base', 'Mlm');

/**
 * Constitute the class wide schema
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ThothMlm.constitute(function addFields() {

	this.addField('title', 'String', {
		description : 'Our title for this MLM model',
	});

	this.addField('thoth_slug', 'String', {
		description : 'The model identifier to send to Thoth',
	});

	this.addBehaviour('Sluggable');
});

/**
 * Configure chimera for this model
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ThothMlm.constitute(function chimeraConfig() {

	if (!this.chimera) {
		return;
	}

	// Get the list group
	const list = this.chimera.getActionFields('list');

	list.addField('title');
	list.addField('thoth_slug');
	list.addField('slug');

	// Get the edit group
	const edit = this.chimera.getActionFields('edit');
	
	edit.addField('title');
	edit.addField('thoth_slug');
	edit.addField('slug');
});

/**
 * Complete the given text
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {string}   text
 * @param    {Object}   options
 */
ThothMlm.setDocumentMethod(function generateTextCompletion(text, options) {

	if (!alchemy.plugins.thoth.client_instance) {
		throw new Error('Thoth client is not enabled');
	}

	let result = alchemy.plugins.thoth.client_instance.generateTextCompletion(this.thoth_slug, text, options);

	return result;

});