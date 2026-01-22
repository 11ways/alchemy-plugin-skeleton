/**
 * The NotFound error class
 * 
 * Thrown when a requested entity cannot be found by slug or identifier.
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {string}   entity       The type of entity (e.g., "Employee", "Project")
 * @param    {string}   identifier   The identifier used to search (e.g., slug value)
 */
const NotFound = Function.inherits('Thoth.Mcp.Error', function NotFound(entity, identifier) {
	let message = `${entity} "${identifier}" not found`;
	NotFound.super.call(this, message);

	this.entity = entity;
	this.identifier = identifier;
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
NotFound.setProperty('code', 'NOT_FOUND');

/**
 * Get the properties to serialize
 *
 * @author   Jelle De Loecker   <jelle@elevenways.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @type     {Array}
 */
NotFound.setProperty(function properties_to_serialize() {
	return ['code', 'entity', 'identifier', 'message', 'stack'];
});
