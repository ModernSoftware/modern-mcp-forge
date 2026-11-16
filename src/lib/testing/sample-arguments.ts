import { generateSync, type JsonSchema } from 'json-schema-faker';
import { isObject, prepareArguments, readArguments } from './tool-arguments';

// Narrow only the generator's copy. Large allowed ranges should still produce
// short examples, and a minimum above the generator's default numeric range
// needs a matching upper bound. Never rewrite literal examples or defaults.
function limitSampleSize(node: JsonSchema) {
  if (typeof node === 'boolean') return;
  if (
    (node.minLength ?? 0) > 4096 ||
    (node.minItems ?? 0) > 64 ||
    (node.minProperties ?? 0) > 128 ||
    (node.minContains ?? 0) > 64
  ) {
    throw new RangeError('Sample exceeds editor limits.');
  }
  if (typeof node.maxLength === 'number')
    node.maxLength = Math.min(
      node.maxLength,
      Math.max(32, node.minLength ?? 0)
    );
  if (typeof node.maxContains === 'number')
    node.maxContains = Math.min(
      node.maxContains,
      Math.max(1, node.minContains ?? 0)
    );

  const lower = node.exclusiveMinimum ?? node.minimum;
  const upper = node.exclusiveMaximum ?? node.maximum;
  const step = Math.max(1, node.multipleOf ?? 1);
  if (lower !== undefined && upper === undefined)
    node.maximum = lower + step * 10;
  if (upper !== undefined && lower === undefined)
    node.minimum = upper - step * 10;

  for (const key of [
    'properties',
    'patternProperties',
    '$defs',
    'definitions',
    'dependentSchemas',
    'dependencies'
  ]) {
    const children = node[key];
    if (isObject(children))
      for (const child of Object.values(children))
        if (isObject(child)) limitSampleSize(child);
  }
  for (const key of [
    'items',
    'prefixItems',
    'contains',
    'allOf',
    'oneOf',
    'anyOf',
    'not',
    'if',
    'then',
    'else',
    'additionalProperties',
    'additionalItems',
    'propertyNames',
    'unevaluatedItems',
    'unevaluatedProperties'
  ]) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach(limitSampleSize);
    else if (isObject(child)) limitSampleSize(child);
  }
}

// This runs in a disposable browser worker. No reference resolver or external
// data provider is configured. The original schema always decides acceptance.
export function sampleArguments(schema: unknown): string | undefined {
  if (!isObject(schema)) return;
  const { validate } = prepareArguments(schema);
  if (!validate) return;

  function accepted(value: unknown) {
    if (!isObject(value)) return;
    const text = JSON.stringify(value, null, 2);
    if (text.length <= 128_000 && !readArguments(text, validate).errors.length)
      return text;
  }

  for (const example of [
    ...(Array.isArray(schema.examples) ? schema.examples : []),
    schema.default
  ]) {
    const text = accepted(example);
    if (text !== undefined) return text;
  }
  const candidateSchema = structuredClone(schema);
  try {
    limitSampleSize(candidateSchema);
  } catch {
    return;
  }
  for (const seed of [1, 2, 3]) {
    try {
      const text = accepted(
        generateSync(candidateSchema, {
          seed,
          maxDepth: 10,
          formats: {
            uri: (random) => `https://example.com/items/${random.int(1, 999)}`,
            email: (random) => `user${random.int(1, 999)}@example.com`
          },
          maxItems: 1,
          maxDefaultItems: 1,
          alwaysFakeOptionals: true,
          useDefaultValue: seed === 1,
          useExamplesValue: seed === 1
        })
      );
      if (text !== undefined) return text;
    } catch {
      // Conflicting constraints or an unsupported branch may have no sample.
    }
  }
}
