/**
 * ThothMcpApiKey model - stores API keys for MCP authentication
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}    options
 */
const ThothMcpApiKey = Function.inherits('Alchemy.Model.Thoth.Base', 'McpApiKey');

/**
 * Constitute the class wide schema
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
ThothMcpApiKey.constitute(function addFields() {
	
	// Link to the user this API key belongs to (only if User model exists)
	try {
		Model.get('User', false);
		this.belongsTo('User');
	} catch (e) {
		// User model not available, skip association
	}
	
	// Friendly name for this API key
	this.addField('name', 'String', {
		description : 'Friendly name for this API key',
		required    : true,
	});
	
	// The API key
	this.addField('key', 'String', {
		description : 'The API key',
	});
	
	// Permissions for this key (if not set, falls back to User's permissions)
	// Only add if Permissions field type exists (from alchemy-acl)
	if (Classes.Alchemy?.Field?.Permissions) {
		this.addField('permissions', 'Permissions', {
			description : 'Explicit permissions for this key. If not configured, falls back to the linked User\'s permissions.',
		});
	}
	
	// When the key was last used
	this.addField('last_used', 'Datetime', {
		description : 'When this key was last used',
	});
	
	// Expiration date (optional)
	this.addField('expires', 'Datetime', {
		description : 'When this key expires (null = never)',
	});
	
	// Whether the key is active
	this.addField('is_active', 'Boolean', {
		default     : true,
		description : 'Whether this key is currently active',
	});
	
	// Optional description/notes
	this.addField('description', 'Text', {
		description : 'Optional notes about this API key',
	});
	
	// Default HTTP headers to apply to requests using this key
	// Useful for setting X-MCP-Recover-Session for faulty clients
	let header_schema = alchemy.createSchema();
	header_schema.addField('name', 'String', {
		description : 'HTTP header name (e.g., X-MCP-Recover-Session)',
		required    : true,
	});
	header_schema.addField('value', 'String', {
		description : 'HTTP header value',
		required    : true,
	});
	
	this.addField('default_headers', 'Schema', {
		schema      : header_schema,
		array       : true,
		description : 'Default HTTP headers to apply to requests. Useful for enabling session recovery (X-MCP-Recover-Session: true) for faulty MCP clients.',
	});
	
	// Server restrictions - which MCP servers this key can access
	this.addField('allowed_servers', 'String', {
		array       : true,
		description : 'MCP server names this key can access. Empty = all servers.',
	});
});

/**
 * Configure chimera for this model
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
ThothMcpApiKey.constitute(function chimeraConfig() {
	
	if (!this.chimera) {
		return;
	}
	
	// Get the list group
	const list = this.chimera.getActionFields('list');
	
	list.addField('name');
	list.addField('key');
	list.addField('User.title', {title: 'User'});
	list.addField('is_active');
	list.addField('last_used');
	list.addField('expires');
	
	// Get the edit group
	const edit = this.chimera.getActionFields('edit');
	
	edit.addField('name');
	edit.addField('key');
	edit.addField('user_id');
	edit.addField('permissions');
	edit.addField('is_active');
	edit.addField('expires');
	edit.addField('description');
	edit.addField('default_headers');
	edit.addField('allowed_servers');
});

/**
 * Generate a new API key.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {string}   The raw API key
 */
ThothMcpApiKey.setDocumentMethod(function generateKey() {
	
	const crypto = require('crypto');
	
	// Generate a secure random key
	let random_part = crypto.randomBytes(32).toString('hex');
	this.key = 'mcp_' + random_part;
	
	return this.key;
});

/**
 * Generate key before first save
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 */
ThothMcpApiKey.setMethod(function beforeSave(doc, options) {
	
	if (!doc.key) {
		doc.generateKey();
	}
});

/**
 * Find an API key by its raw value
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   raw_key   The raw API key
 *
 * @return   {Document|null}
 */
ThothMcpApiKey.setMethod(async function findByRawKey(raw_key) {
	
	if (!raw_key || typeof raw_key !== 'string') {
		return null;
	}
	
	// Find by key directly
	let doc = await this.findByValues({
		key       : raw_key,
		is_active : true,
	});
	
	if (!doc) {
		return null;
	}
	
	// Check expiration
	if (doc.expires && doc.expires < new Date()) {
		return null;
	}
	
	// Update last_used timestamp (throttled to once per minute to reduce DB writes)
	let now = new Date();
	let should_update = !doc.last_used || (now - doc.last_used) > 60000;
	
	if (should_update) {
		doc.last_used = now;
		await doc.save();
	}
	
	return doc;
});

/**
 * Check if this key has a specific permission.
 * First checks the key's own permissions, then falls back to User.
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   permission
 *
 * @return   {boolean}
 */
ThothMcpApiKey.setDocumentMethod(async function hasPermission(permission) {
	
	// 1. Check key's own permissions first
	if (this.permissions) {
		let entry = this.permissions.lookupPermission(permission);
		
		if (entry !== null) {
			// Permission is explicitly configured on the key
			return entry.value;
		}
	}
	
	// 2. Permission not configured on key - fall back to User
	if (this.user_id) {
		// Make sure User is populated
		if (!this.User) {
			await this.populate('User');
		}
		
		if (this.User && typeof this.User.hasPermission === 'function') {
			return this.User.hasPermission(permission);
		}
	}
	
	// 3. No user configured - deny by default
	return false;
});

/**
 * Get the permission value for this key.
 * Returns true, false, or null (not configured).
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   permission
 *
 * @return   {boolean|null}
 */
ThothMcpApiKey.setDocumentMethod(function getPermissionValue(permission) {
	
	if (this.permissions) {
		let entry = this.permissions.lookupPermission(permission);
		
		if (entry !== null) {
			return entry.value;
		}
	}
	
	return null;
});
