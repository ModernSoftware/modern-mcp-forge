import { expect, test } from 'bun:test';
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
