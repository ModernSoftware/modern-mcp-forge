import { z } from 'zod';
import type { PromptDefinition } from '$lib/server/project/schema';

export function buildPromptArgsSchema(prompt: PromptDefinition) {
  const shape: Record<string, z.ZodType> = {};

  for (const [name, definition] of Object.entries(prompt.arguments)) {
    let schema: z.ZodType = z.string();

    if (definition.description) {
      schema = schema.describe(definition.description);
    }

    if (!definition.required) {
      schema = schema.optional();
    }

    shape[name] = schema;
  }

  return z.object(shape);
}
