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
          '$schema'
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
  const fields: SchemaField[] = [];
  for (const [name, value] of Object.entries(schema.properties)) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const field = value as Record<string, unknown>;
    if (!scalarTypes.includes(String(field.type))) return null;
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
