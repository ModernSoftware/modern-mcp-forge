import { test, expect } from 'bun:test';
import {
  schemaFields,
  fieldsSchema
} from '../../src/lib/authoring/schema-fields';
test('visual fields round-trip validation and reject duplicate trimmed names', () => {
  const schema = {
    type: 'object',
    properties: {
      sku: { type: 'string', minLength: 1 },
      quantity: { type: 'integer', minimum: 1 }
    },
    required: ['sku'],
    additionalProperties: false
  };
  const fields = schemaFields(schema)!;
  expect(fieldsSchema(fields, schema)).toEqual(schema);
  fields[1].required = true;
  expect(fieldsSchema(fields, schema).required).toEqual(['sku', 'quantity']);
  fields[1].name = ' sku ';
  expect(() => fieldsSchema(fields, schema)).toThrow('unique');
});
test('nested and cross-field rules cannot silently become visual fields', () => {
  expect(
    schemaFields({
      type: 'object',
      properties: { filter: { type: 'object', properties: {} } }
    })
  ).toBeNull();
  expect(
    schemaFields({ type: 'object', properties: {}, oneOf: [] })
  ).toBeNull();
  expect(
    schemaFields({ type: 'object', properties: {}, required: ['missing'] })
  ).toBeNull();
});
