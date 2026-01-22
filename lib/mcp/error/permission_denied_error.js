/**
 * The PermissionDenied error class
 * 
 * Thrown when a user lacks permission to execute a tool.
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   permission   The permission that was required
 */
const PermissionDenied = Function.inherits('Thoth.Mcp.Error', function PermissionDenied(permission) {
	let message = `Permission denied: ${permission}`;
	PermissionDenied.super.call(this, message);

	this.permission = permission;
});

/**
 * The error code for programmatic handling
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @type     {string}
 */
PermissionDenied.setProperty('code', 'PERMISSION_DENIED');

/**
 * Get the properties to serialize
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @type     {Array}
 */
PermissionDenied.setProperty(function properties_to_serialize() {
	return ['code', 'permission', 'message', 'stack'];
});
