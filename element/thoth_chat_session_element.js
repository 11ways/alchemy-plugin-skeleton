/**
 * The <thoth-chat-session> custom element
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
const ChatSession = Function.inherits('Alchemy.Element.App', 'ThothChatSession');

/**
 * The hawkejs template to use
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ChatSession.setTemplateFile('elements/thoth/chat_session');

/**
 * Where to get the data from
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ChatSession.setAssignedProperty('record');

/**
 * Get variables needed to render this
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.1.0
 * @version  0.1.0
 */
ChatSession.setMethod(function introduced() {
	
});
