import { z } from 'zod';

export const ToolArgumentTypeSchema = z.enum([
  'string',
  'number',
  'boolean'
]);

export const ToolArgumentDefinitionSchema = z.object({
  type: ToolArgumentTypeSchema,
  description: z.string().optional(),
  required: z.boolean().default(false)
});

export const ArgumentDefinitionSchema = ToolArgumentDefinitionSchema;

export const ToolRuntimeSchema = z.enum([
  'bun',
  'node',
  'python',
  'dotnet'
]);

export const ToolArgumentsModeSchema = z.enum([
  'fields',
  'json-schema'
]);

const JsonSchemaDocumentSchema = z.record(
  z.string(),
  z.unknown()
);

export const ToolDefinitionSchema = z
  .object({
    name: z.string().min(1),
    title: z.string().optional(),
    description: z.string().default(''),
    enabled: z.boolean().default(true),
    runtime: ToolRuntimeSchema,
    entrypoint: z.string().min(1),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().positive().max(300_000).default(30_000),
    maxOutputBytes: z.number().int().positive().max(16 * 1024 * 1024).default(1024 * 1024),
    argumentsMode: ToolArgumentsModeSchema.optional(),
    arguments: z.record(z.string(), ToolArgumentDefinitionSchema).default({}),
    inputSchema: JsonSchemaDocumentSchema.optional()
  })
  .passthrough()
  .superRefine((tool, context) => {
    if (tool.argumentsMode !== 'json-schema') {
      return;
    }

    if (!tool.inputSchema) {
      context.addIssue({
        code: 'custom',
        path: ['inputSchema'],
        message: 'JSON Schema argument mode requires inputSchema.'
      });
      return;
    }

    if (tool.inputSchema.type !== 'object') {
      context.addIssue({
        code: 'custom',
        path: ['inputSchema', 'type'],
        message: 'Forge tool input schemas must have an object at the root.'
      });
    }
  });

export const ResourceDefinitionSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  description: z.string().default(''),
  enabled: z.boolean().default(true),
  uri: z.string().min(1),
  mimeType: z.string().min(1).default('text/plain'),
  source: z.string().min(1)
});

export const PromptArgumentDefinitionSchema = z.object({
  description: z.string().optional(),
  required: z.boolean().default(false)
});

export const PromptDefinitionSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  description: z.string().default(''),
  enabled: z.boolean().default(true),
  role: z.enum(['user', 'assistant']).default('user'),
  template: z.string().min(1),
  arguments: z.record(z.string(), PromptArgumentDefinitionSchema).default({})
});

export const ForgeProjectManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    project: z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
      description: z.string().optional()
    }).passthrough(),
    server: z.object({
      name: z.string().min(1),
      version: z.string().min(1),
      instructions: z.string().optional()
    }).passthrough(),
    tools: z.array(ToolDefinitionSchema).default([]),
    resources: z.array(ResourceDefinitionSchema).default([]),
    prompts: z.array(PromptDefinitionSchema).default([])
  })
  .passthrough();

export type ToolArgumentType = z.infer<typeof ToolArgumentTypeSchema>;
export type ToolArgumentDefinition = z.infer<typeof ToolArgumentDefinitionSchema>;
export type ArgumentDefinition = ToolArgumentDefinition;
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
export type ResourceDefinition = z.infer<typeof ResourceDefinitionSchema>;
export type PromptArgumentDefinition = z.infer<typeof PromptArgumentDefinitionSchema>;
export type PromptDefinition = z.infer<typeof PromptDefinitionSchema>;
export type ForgeProjectManifest = z.infer<typeof ForgeProjectManifestSchema>;
