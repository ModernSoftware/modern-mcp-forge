import { test, expect } from 'bun:test';
import pack from '../../examples/bridges/compatibility-lab/native/mcpack.json';
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

test('the lab quote stays visually editable and preserves examples, bounds and enum choices', () => {
  const quote = pack.tools[0].inputSchema;
  const fields = schemaFields(quote)!;
  expect(fields.map((f) => f.name)).toEqual(['sku', 'quantity', 'tier']);
  fields[0].description = 'Stock keeping unit';
  expect(JSON.parse(JSON.stringify(fieldsSchema(fields, quote)))).toEqual({
    ...quote,
    properties: {
      ...quote.properties,
      sku: { ...quote.properties.sku, description: 'Stock keeping unit' }
    }
  });
  expect(schemaFields(pack.tools[1].inputSchema)).toBeNull();
});
