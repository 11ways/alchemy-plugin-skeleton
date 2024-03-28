/**
 * ThothChatMessage model:
 * Each message in a chat session gets its own record
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}    options
 */
const ThothChatMessage = Function.inherits('Alchemy.Model.Thoth.Base', 'ChatMessage');

/**
 * Constitute the class wide schema
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ThothChatMessage.constitute(function addFields() {

	this.belongsTo('ThothChatSession', 'Thoth.ChatSession', {
		description: 'The session this message belongs to',
	});

	this.belongsTo('ThothChatMlm', 'Thoth.ChatMlm', {
		description: 'The MLM that responded',
	});

	this.belongsTo('User', {
		description: 'The user that sent this message (if from a user)',
	});

	this.addField('text', 'Text', {
		description : 'The text of this message',
	});

	this.belongsTo('Parent', 'Thoth.ChatMessage', {
		description: 'The parent message',
	});

});

/**
 * Configure chimera for this model
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ThothChatMessage.constitute(function chimeraConfig() {

	if (!this.chimera) {
		return;
	}

	// Get the list group
	const list = this.chimera.getActionFields('list');

	list.addField('created');
	list.addField('ThothChatSession.title', {
		title: 'Session',
	});
	list.addField('User.title', {
		title: 'User',
	});
	list.addField('ThothChatMlm.title', {
		title: 'MLM',
	});

	// Get the edit group
	const edit = this.chimera.getActionFields('edit');
	
	edit.addField('thoth_chat_session_id');
	edit.addField('user_id');
	edit.addField('thoth_chat_mlm_id');
	edit.addField('text');
});
