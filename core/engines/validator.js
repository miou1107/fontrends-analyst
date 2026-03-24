/**
 * validator.js — JSON Schema validation for pipeline data files
 */

const Ajv = require('ajv');
const path = require('path');
const { readJSON } = require('./helpers');

const ajv = new Ajv({ allErrors: true });

// Pre-load schemas
const SCHEMA_DIR = path.join(__dirname, '..', 'schemas', 'validation');
const schemas = {
  interview: readJSON(path.join(SCHEMA_DIR, 'interview.schema.json')),
  narrative: readJSON(path.join(SCHEMA_DIR, 'narrative.schema.json')),
};

// Compile validators
const validators = {};
for (const [name, schema] of Object.entries(schemas)) {
  if (schema) validators[name] = ajv.compile(schema);
}

/**
 * Validate a JSON object against a named schema.
 * Returns { valid: true } or { valid: false, errors: [...] }
 */
function validate(schemaName, data) {
  const validator = validators[schemaName];
  if (!validator) {
    return { valid: true, warnings: [`Schema '${schemaName}' not found, skipping validation`] };
  }

  const valid = validator(data);
  if (valid) return { valid: true };

  const errors = validator.errors.map(e => {
    const field = e.instancePath || '(root)';
    return `${field}: ${e.message}`;
  });

  return { valid: false, errors };
}

/**
 * Validate and warn (non-blocking). Prints warnings but doesn't throw.
 */
function validateAndWarn(schemaName, data, fileName) {
  const result = validate(schemaName, data);
  if (result.warnings) {
    result.warnings.forEach(w => console.log(`⚠️  ${w}`));
  }
  if (!result.valid) {
    console.log(`⚠️  ${fileName} schema 驗證失敗（非致命，繼續執行）：`);
    result.errors.forEach(e => console.log(`   - ${e}`));
  }
  return result.valid;
}

module.exports = { validate, validateAndWarn };
