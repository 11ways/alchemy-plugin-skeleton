/**
 * ThothChatMlm model:
 * An MLM model that can be used for chatting
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}    options
 */
const ThothChatMlm = Function.inherits('Alchemy.Model.Thoth.Base', 'ChatMlm');

/**
 * Constitute the class wide schema
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ThothChatMlm.constitute(function addFields() {

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
ThothChatMlm.constitute(function chimeraConfig() {

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
