export type PromptArgument = Record<string, unknown> & {
  name: string;
  description: string;
  required: boolean;
};

export function promptFields(value: unknown): PromptArgument[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const fields: PromptArgument[] = [];
  for (const field of value) {
    if (
      !field ||
      typeof field !== 'object' ||
      Array.isArray(field) ||
      typeof field.name !== 'string' ||
      (field.description !== undefined &&
        typeof field.description !== 'string') ||
      (field.required !== undefined && typeof field.required !== 'boolean')
    )
      return null;
    fields.push({
      ...field,
      description: field.description ?? '',
      required: field.required ?? false
    });
  }
  return fields;
}

export function promptDefinitions(
  fields: PromptArgument[]
): PromptArgument[] {
  const names = new Set<string>();
  return fields.map((field) => {
    const name = field.name.trim();
    if (!name || names.has(name))
      throw new Error('Prompt argument names must be nonempty and unique.');
    names.add(name);
    return { ...field, name };
  });
}

/** MCP prompt arguments are a map of strings, independent of tool JSON Schema. */
export function promptArgumentsSchema(argumentsList: unknown) {
  const fields = promptFields(argumentsList) ?? [];
  return {
    type: 'object',
    properties: Object.fromEntries(
      fields.map((field) => [
        field.name,
        {
          type: 'string',
          description: field.description
        }
      ])
    ),
    required: fields
      .filter((field) => field.required)
      .map((field) => field.name),
    additionalProperties: false
  };
}
