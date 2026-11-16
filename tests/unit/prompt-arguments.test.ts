import { expect, test } from 'bun:test';
import {
  promptFields,
  promptDefinitions,
  promptArgumentsSchema
} from '../../src/lib/authoring/prompt-arguments';
import {
  prepareArguments,
  readArguments
} from '../../src/lib/testing/tool-arguments';

test('visual prompt definitions preserve metadata and reject duplicate or blank names', () => {
  const fields = promptFields([
    { name: 'topic', required: true, description: 'Topic', title: 'Subject' }
  ])!;
  expect(promptDefinitions(fields)).toEqual([
    { name: 'topic', required: true, description: 'Topic', title: 'Subject' }
  ]);
  expect(promptFields(undefined)).toEqual([]);
  expect(promptFields({ topic: { type: 'string' } })).toBeNull();
  expect(promptFields([{ name: 'topic', required: 'true' }])).toBeNull();
  expect(() =>
    promptDefinitions([...fields, { ...fields[0], name: ' topic ' }])
  ).toThrow('unique');
  expect(() => promptDefinitions([{ ...fields[0], name: ' ' }])).toThrow(
    'nonempty'
  );
});

test('prompt testing enforces string arguments, required names and JSON round trips', () => {
  const schema = promptArgumentsSchema([
    { name: 'topic', required: true },
    { name: 'settings' }
  ]);
  const { form, validate } = prepareArguments(schema);
  expect(form).toBeTruthy();
  const check = (value: unknown) =>
    readArguments(JSON.stringify(value), validate);
  expect(check({}).errors).toContainEqual(
    expect.objectContaining({ path: '/topic' })
  );
  expect(
    check({ topic: '', settings: '{"temperature":0.6}' }).errors
  ).toEqual([]);
  for (const value of [42, false, [], { temperature: 0.6 }]) {
    expect(check({ topic: 'review', settings: value }).errors).toContainEqual(
      expect.objectContaining({ path: '/settings' })
    );
  }
  expect(
    check({ topic: 'review', unknown: 'value' }).errors.length
  ).toBeGreaterThan(0);
  expect(prepareArguments(promptArgumentsSchema([])).validate!({})).toBe(
    true
  );
});
