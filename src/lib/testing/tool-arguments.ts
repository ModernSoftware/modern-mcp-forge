import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';

type Scalar = string | number | boolean;
export interface FieldSchema {
  type: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean';
  additionalProperties?: boolean;
  properties?: Record<string, FieldSchema>;
  required?: string[];
  items?: FieldSchema;
  enum?: Scalar[];
  title?: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const options = {
  allErrors: true,
  ownProperties: true,
  addUsedSchema: false,
  validateFormats: false,
  strict: false
};
const formKeywords = new Set([
  '$schema',
  '$id',
  '$comment',
  'title',
  'description',
  'default',
  'examples',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties'
]);

function formLimitation(schema: unknown, path: string): string {
  if (!isObject(schema)) return path + ' uses a free-form schema.';
  const keyword = Object.keys(schema).find((key) => !formKeywords.has(key));
  if (keyword) return path + ' uses ' + keyword + '.';
  if (
    !['string', 'integer', 'number', 'boolean', 'array', 'object'].includes(
      String(schema.type)
    ) ||
    typeof schema.type !== 'string'
  )
    return path + ' does not declare a single field type.';
  if (
    schema.enum &&
    (!Array.isArray(schema.enum) ||
      schema.enum.some((v) => v === null || typeof v === 'object'))
  )
    return path + ' uses a complex enum.';
  if (schema.type === 'array') return formLimitation(schema.items, path + '[]');
  if (schema.type === 'object') {
    if (isObject(schema.additionalProperties))
      return path + ' defines custom property types.';
    const properties = isObject(schema.properties) ? schema.properties : {};
    if (
      Array.isArray(schema.required) &&
      schema.required.some((name) => !Object.hasOwn(properties, name))
    )
      return path + ' requires an undeclared field.';
    for (const [name, child] of Object.entries(properties)) {
      const reason = formLimitation(child, path + '.' + name);
      if (reason) return reason;
    }
  }
  return '';
}

export function prepareArguments(schema: unknown) {
  let form: FieldSchema | undefined;
  let limitation = 'This tool has no object input schema.';
  let validate: ValidateFunction | undefined;
  if (isObject(schema)) {
    // Each tool owns its references, even when different servers use the same schema ID.
    try {
      const Validator =
        schema.$schema === 'http://json-schema.org/draft-07/schema#'
          ? Ajv
          : Ajv2020;
      const compiled = new Validator(options).compile(schema);
      if ('$async' in compiled && compiled.$async)
        throw new Error('Asynchronous schema');
      validate = compiled;
      if (schema.type === 'object') {
        limitation = formLimitation(schema, 'Arguments');
        if (!limitation) form = schema as unknown as FieldSchema;
      }
    } catch {
      limitation =
        'Forge cannot validate this schema locally. The tool server will validate the request.';
    }
  }
  return { form, limitation, validate };
}

export function childPath(path: string, name: string) {
  return path + '/' + name.replaceAll('~', '~0').replaceAll('/', '~1');
}

function fieldError(error: ErrorObject) {
  const field = error.params.missingProperty ?? error.params.additionalProperty;
  const path =
    typeof field === 'string'
      ? childPath(error.instancePath, field)
      : error.instancePath;
  const message =
    error.keyword === 'required'
      ? 'Required.'
      : (error.message ?? 'Invalid value.');
  return { path, message };
}

export function readArguments(text: string, validate?: ValidateFunction) {
  let value: unknown;
  try {
    value = JSON.parse(text, (_key, item: unknown) => {
      if (typeof item === 'number' && !Number.isFinite(item))
        throw new RangeError('This number exceeds the supported finite range.');
      return item;
    });
  } catch (error) {
    return {
      value: undefined,
      errors: [
        {
          path: '',
          message:
            error instanceof RangeError
              ? error.message
              : 'Finish the JSON syntax to run this tool.'
        }
      ]
    };
  }
  if (!isObject(value))
    return {
      value: undefined,
      errors: [{ path: '', message: 'Tool arguments must be a JSON object.' }]
    };
  return {
    value,
    errors:
      validate && !validate(value)
        ? (validate.errors ?? []).map(fieldError)
        : []
  };
}

// Editing one known field must keep its siblings, including additional properties.
export function withField(value: unknown, name: string, next: unknown) {
  const result = { ...(isObject(value) ? value : {}), [name]: next };
  if (next === undefined) delete result[name];
  return result;
}

export function newItem(schema: FieldSchema): unknown {
  if (schema.enum) return schema.enum[0];
  switch (schema.type) {
    case 'array':
      return [];
    case 'object':
      return {};
    case 'boolean':
      return false;
    case 'string':
      return '';
    default:
      return schema.minimum ?? 0;
  }
}
