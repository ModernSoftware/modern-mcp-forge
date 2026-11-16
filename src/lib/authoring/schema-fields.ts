export type SchemaField = {
  name: string;
  type: string;
  description: string;
  required: boolean;
  schema: Record<string, unknown>;
};
const scalarTypes = ['string', 'number', 'integer', 'boolean'];
export function schemaFields(schema: any): SchemaField[] | null {
  if (
    !schema ||
    schema.type !== 'object' ||
    !schema.properties ||
    typeof schema.properties !== 'object' ||
    Array.isArray(schema.properties)
  )
    return null;
  // Cross-field rules and nested structures stay in JSON mode, without conversion.
  if (
    Object.keys(schema).some(
      (key) =>
        ![
          'type',
          'properties',
          'required',
          'additionalProperties',
          'description',
          'title',
          '$schema',
          '$id',
          '$comment',
          'default',
          'examples',
          'deprecated',
          'readOnly',
          'writeOnly'
        ].includes(key)
    )
  )
    return null;
  if (
    schema.required !== undefined &&
    (!Array.isArray(schema.required) ||
      schema.required.some(
        (key: unknown) =>
          typeof key !== 'string' || !Object.hasOwn(schema.properties, key)
      ))
  )
    return null;
  if (typeof schema.additionalProperties === 'object') return null;
  const fields: SchemaField[] = [];
  for (const [name, value] of Object.entries(schema.properties)) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const field = value as Record<string, unknown>;
    if (typeof field.type !== 'string' || !scalarTypes.includes(field.type))
      return null;
    if (
      [
        '$ref',
        '$dynamicRef',
        'oneOf',
        'anyOf',
        'allOf',
        'not',
        'if',
        'then',
        'else',
        'contentSchema'
      ].some((key) => Object.hasOwn(field, key))
    )
      return null;
    fields.push({
      name,
      type: String(field.type),
      description: String(field.description ?? ''),
      required: schema.required?.includes(name) ?? false,
      schema: { ...field }
    });
  }
  return fields;
}
export function fieldsSchema(
  fields: SchemaField[],
  original: Record<string, unknown>
) {
  const properties: Record<string, unknown> = Object.create(null);
  const required: string[] = [];
  for (const field of fields) {
    const name = field.name.trim();
    if (!name || Object.hasOwn(properties, name))
      throw new Error('Field names must be nonempty and unique.');
    if (!scalarTypes.includes(field.type))
      throw new Error('Unsupported field type.');
    if (
      field.type === 'string' &&
      field.schema.type === 'string' &&
      field.schema.minLength !== undefined &&
      !(
        typeof field.schema.minLength === 'number' &&
        Number.isInteger(field.schema.minLength) &&
        field.schema.minLength >= 0
      )
    )
      throw new Error(
        `Minimum length for "${name}" must be a nonnegative integer.`
      );
    // Keep validation keywords for existing fields; changing type is an explicit reset.
    properties[name] = {
      ...(field.schema.type === field.type ? field.schema : {}),
      type: field.type,
      description: field.description || undefined
    };
    if (field.required) required.push(name);
  }
  return { ...original, type: 'object', properties, required };
}
