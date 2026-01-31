/**
 * Validation layer foundation.
 * Middleware that validates req.body / params / query against a schema and throws AppError on failure.
 * Do not apply to routes until schemas are defined and migration is planned.
 *
 * @param {Object} options - { body?: schema, params?: schema, query?: schema }
 * @param {Function} schemaValidator - (value, schema) => { valid: boolean, errors?: string[] }
 *    For now we accept a simple validator; can be replaced with Joi/Zod later.
 */

const AppError = require('../../core/errors/AppError');

/**
 * Validates request parts against provided schemas.
 * Expects schema to have a validate(value) method returning { value, error } (e.g. Joi)
 * or (value) => { valid: boolean, errors?: string[] }.
 *
 * @param {Object} schemas - { body?: schema, params?: schema, query?: schema }
 * @returns {Function} Express middleware
 */
const validate = (schemas = {}) => {
    return (req, res, next) => {
        const errors = [];

        if (schemas.body) {
            const result = runValidation(req.body, schemas.body, 'body');
            if (result) errors.push(...result);
        }
        if (schemas.params) {
            const result = runValidation(req.params, schemas.params, 'params');
            if (result) errors.push(...result);
        }
        if (schemas.query) {
            const result = runValidation(req.query, schemas.query, 'query');
            if (result) errors.push(...result);
        }

        if (errors.length > 0) {
            const message = errors.join('; ');
            return next(new AppError(message, 400, true));
        }

        next();
    };
};

/**
 * Run validation. Supports:
 * - Joi: schema.validate(value) => { value, error }
 * - Simple: schema(value) => { valid: boolean, errors?: string[] }
 * - Zod: schema.safeParse(value) => { success, error }
 */
function runValidation(value, schema, source) {
    if (typeof schema.validate === 'function') {
        const { error } = schema.validate(value);
        if (error) {
            return error.details.map((d) => `${source}: ${d.message}`);
        }
        return null;
    }
    if (typeof schema.safeParse === 'function') {
        const result = schema.safeParse(value);
        if (!result.success) {
            return result.error.errors.map((e) => `${source}: ${e.message}`);
        }
        return null;
    }
    if (typeof schema === 'function') {
        const result = schema(value);
        if (result && result.valid === false && result.errors) {
            return result.errors.map((msg) => `${source}: ${msg}`);
        }
        return null;
    }
    return null;
}

module.exports = validate;
