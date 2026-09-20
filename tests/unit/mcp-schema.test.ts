import { describe, expect, test } from 'bun:test';

import { buildToolInputSchema } from '$lib/server/mcp/input-schema';
import { buildPromptArgsSchema } from '$lib/server/mcp/prompt-schema';
import type { PromptDefinition, ToolDefinition } from '$lib/server/project/schema';

type ToolInputSchema = ReturnType<typeof buildToolInputSchema>;

async function schemaAccepts(
  schema: ToolInputSchema,
  value: unknown
): Promise<boolean> {
  const result = await schema['~standard'].validate(value);

  return !('issues' in result);
}

describe('buildToolInputSchema', () => {
  test('validates required and optional field arguments', async () => {
    const tool: ToolDefinition = {
      name: 'field_tool',
      runtime: 'node',
      entrypoint: './tool.js',
      enabled: true,
      description: '',
      timeoutMs: 30_000,
      maxOutputBytes: 1024 * 1024,
      arguments: {
        text: {
          type: 'string',
          required: true,
          description: 'Text'
        },
        count: {
          type: 'number',
          required: false
        },
        flag: {
          type: 'boolean',
          required: false
        }
      }
    };

    const schema = buildToolInputSchema(tool);

    expect(await schemaAccepts(schema, { text: 'hello' })).toBe(true);
    expect(
      await schemaAccepts(schema, {
        text: 'hello',
        count: 2,
        flag: true
      })
    ).toBe(true);
    expect(await schemaAccepts(schema, {})).toBe(false);
    expect(await schemaAccepts(schema, { text: 123 })).toBe(false);
    expect(
      await schemaAccepts(schema, {
        text: 'hello',
        count: '2'
      })
    ).toBe(false);
  });

  test('validates advanced JSON Schema', async () => {
    const tool: ToolDefinition = {
      name: 'schema_tool',
      runtime: 'node',
      entrypoint: './tool.js',
      enabled: true,
      description: '',
      timeoutMs: 30_000,
      maxOutputBytes: 1024 * 1024,
      argumentsMode: 'json-schema',
      arguments: {},
      inputSchema: {
        type: 'object',
        required: ['customer'],
        properties: {
          customer: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string' }
            }
          }
        }
      }
    };

    const schema = buildToolInputSchema(tool);

    expect(
      await schemaAccepts(schema, {
        customer: {
          id: 'abc'
        }
      })
    ).toBe(true);

    expect(
      await schemaAccepts(schema, {
        customer: {}
      })
    ).toBe(false);

    expect(await schemaAccepts(schema, {})).toBe(false);
  });
});

describe('buildPromptArgsSchema', () => {
  const prompt: PromptDefinition = {
    name: 'review',
    enabled: true,
    description: '',
    role: 'user',
    template: './prompts/review.md',
    arguments: {
      language: {
        required: true,
        description: 'Language'
      },
      focus: {
        required: false
      }
    }
  };

  test('requires required prompt arguments', () => {
    const schema = buildPromptArgsSchema(prompt);

    expect(schema.safeParse({ language: 'TypeScript' }).success).toBe(true);
    expect(
      schema.safeParse({
        language: 'TypeScript',
        focus: 'security'
      }).success
    ).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
  });

  test('requires prompt values to be strings', () => {
    const schema = buildPromptArgsSchema(prompt);

    expect(schema.safeParse({ language: 123 }).success).toBe(false);
  });
});
