/**
 * ThothChatSession model
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}    options
 */
const ThothChatSession = Function.inherits('Alchemy.Model.Thoth.Base', 'ChatSession');

/**
 * Constitute the class wide schema
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ThothChatSession.constitute(function addFields() {

	this.belongsTo('User', {
		description: 'The user this session belongs to',
	});

	this.addField('title', 'String', {
		description : 'The title of this session',
	});

});

/**
 * Configure chimera for this model
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ThothChatSession.constitute(function chimeraConfig() {

	if (!this.chimera) {
		return;
	}

	// Get the list group
	const list = this.chimera.getActionFields('list');

	list.addField('created');
	list.addField('User.title', {
		title: 'User',
	});
	list.addField('title');

	// Get the edit group
	const edit = this.chimera.getActionFields('edit');
	
	edit.addField('user_id');
	edit.addField('title');
});
