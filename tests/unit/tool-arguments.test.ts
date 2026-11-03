import { expect, test } from 'bun:test';
import { sampleArguments } from '../../src/lib/testing/sample-arguments';
import {
  prepareArguments,
  readArguments,
  withField
} from '../../src/lib/testing/tool-arguments';
import pack from '../../examples/bridges/compatibility-lab/native/mcpack.json';

test('validates the original quote and delivery schemas without coercion', () => {
  const quote = prepareArguments(pack.tools[0].inputSchema);
  const shipping = prepareArguments(pack.tools[1].inputSchema);
  expect(quote.form).toBeDefined();
  expect(shipping.form).toBeDefined();
  const read = (value: unknown) =>
    readArguments(JSON.stringify(value), quote.validate);
  expect(read({ sku: 'ACT-42', quantity: 3 }).errors).toEqual([]);
  expect(read({ sku: 'ACT-42', quantity: '3' }).errors[0].path).toBe(
    '/quantity'
  );
  expect(
    read({ sku: 'ACT-42', quantity: 0, tier: 'vip' }).errors.map((e) => e.path)
  ).toEqual(['/quantity', '/tier']);
  expect(read({ sku: 'ACT-42' }).errors[0].path).toBe('/quantity');
  const nested = {
    orderedAtLocal: '2026-10-30T16:00',
    service: 'express',
    parcels: [{ kg: 0 }]
  };
  expect(
    readArguments(JSON.stringify(nested), shipping.validate).errors[0].path
  ).toBe('/parcels/0/kg');
});

test('raw-only schemas still validate and unresolved references remain runnable as JSON', () => {
  const union = prepareArguments({
    type: 'object',
    properties: { item: { oneOf: [{ type: 'string' }, { type: 'number' }] } }
  });
  expect(union.limitation).toContain('oneOf');
  expect(union.form).toBeUndefined();
  expect(
    readArguments('{"item":null}', union.validate).errors.length
  ).toBeGreaterThan(0);
  expect(readArguments('{"item":0}', union.validate).errors).toEqual([]);
  const ref = prepareArguments({
    type: 'object',
    properties: { item: { $ref: 'https://example.test/item' } }
  });
  expect(ref.validate).toBeUndefined();
  expect(ref.limitation).toContain('server');
  for (const text of ['{', '[]', 'null', '{"x":1e999}'])
    expect(readArguments(text, ref.validate).value).toBeUndefined();
});

test('edits preserve unknown properties, explicit values and omission', () => {
  const initial = JSON.parse(
    '{"__proto__":{"x":1},"extra":null,"enabled":false,"count":0,"text":""}'
  );
  const changed = withField(initial, 'added', true);
  expect(withField(changed, 'added', undefined)).toEqual(initial);
  const userKey = withField({}, '__proto__', false);
  expect(Object.hasOwn(userKey, '__proto__')).toBe(true);
  expect(Object.getPrototypeOf(userKey)).toBe(Object.prototype);
  expect(JSON.stringify(userKey)).toBe('{"__proto__":false}');
});

test('samples typed arguments and honors published examples and local references', () => {
  for (const tool of pack.tools)
    expect(JSON.parse(sampleArguments(tool.inputSchema)!)).toEqual(
      tool.inputSchema.examples[0]
    );
  const schema = {
    type: 'object',
    additionalProperties: false,
    $defs: { sku: { type: 'string', pattern: '^SKU-[0-9]{3}$' } },
    properties: {
      sku: { $ref: '#/$defs/sku' },
      count: {
        type: 'integer',
        exclusiveMinimum: 5,
        maximum: 15,
        multipleOf: 3
      },
      weight: { type: 'number', minimum: 0.1, maximum: 0.9 },
      flags: { type: 'array', minItems: 2, items: { type: 'boolean' } },
      mode: { enum: ['fast', 'slow'] },
      label: { type: 'string', minLength: 3, maxLength: 7 },
      empty: { type: 'null' },
      optionalField: { type: 'string', default: 'inventory' }
    },
    required: ['sku', 'count', 'weight', 'flags', 'mode', 'label', 'empty']
  };
  const text = sampleArguments(schema);
  expect(text).toBeDefined();
  const sample = JSON.parse(text!);
  expect(prepareArguments(schema).validate?.(sample)).toBe(true);
  expect(sample.optionalField).toBe('inventory');
  expect(sample.sku).toMatch(/^SKU-[0-9]{3}$/);
});

test('ignores invalid examples and declines impossible or unresolved schemas', () => {
  const schema = {
    type: 'object',
    properties: { x: { type: 'integer', default: 'wrong' } },
    required: ['x'],
    examples: [{ x: false }]
  };
  expect(typeof JSON.parse(sampleArguments(schema)!).x).toBe('number');
  expect(sampleArguments({ type: 'object', not: {} })).toBeUndefined();
  expect(
    sampleArguments({ $ref: 'https://example.invalid/unavailable' })
  ).toBeUndefined();
});

test('generates small samples for large allowed ranges and declines oversized minimums', () => {
  const schema = {
    type: 'object',
    properties: {
      id: { type: 'integer', minimum: 90000 },
      label: { type: 'string', maxLength: 10_000_000 }
    },
    required: ['id', 'label']
  };
  const value = JSON.parse(sampleArguments(schema)!);
  expect(value.id).toBeGreaterThanOrEqual(90000);
  expect(value.label.length).toBeLessThanOrEqual(32);
  expect(schema.properties.label.maxLength).toBe(10_000_000);
  expect(
    sampleArguments({
      type: 'object',
      properties: { x: { type: 'array', minItems: 100_000_000 } },
      required: ['x']
    })
  ).toBeUndefined();
});
