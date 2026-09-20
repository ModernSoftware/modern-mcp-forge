import { fromJsonSchema } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type {
  ToolArgumentDefinition,
  ToolDefinition
} from '$lib/server/project/schema';

function buildFieldSchema(
  definition: ToolArgumentDefinition
): z.ZodType {
  let schema: z.ZodType;

  switch (definition.type) {
    case 'string':
      schema = z.string();
      break;

    case 'number':
      schema = z.number();
      break;

    case 'boolean':
      schema = z.boolean();
      break;
  }

  if (definition.description) {
    schema = schema.describe(definition.description);
  }

  if (!definition.required) {
    schema = schema.optional();
  }

  return schema;
}

export function buildToolInputSchema(tool: ToolDefinition) {
  if (tool.argumentsMode === 'json-schema' && tool.inputSchema) {
    return fromJsonSchema<Record<string, unknown>>(
      tool.inputSchema as any
    );
  }

  const shape: Record<string, z.ZodType> = {};

  for (const [name, definition] of Object.entries(tool.arguments)) {
    shape[name] = buildFieldSchema(definition);
  }

  return z.object(shape);
}
