import * as z from 'zod/v4';

export const FORGE_TOOL_ABI_VERSION = 1 as const;

export interface ForgeToolExecutionRequest {
  protocolVersion: typeof FORGE_TOOL_ABI_VERSION;
  executionId: string;
  tool: {
    name: string;
  };
  arguments: Record<string, unknown>;
  context: {
    projectRoot: string;
  };
}

const TextContentBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string()
});

const ToolResultSchema = z.object({
  content: z.array(TextContentBlockSchema).min(1),
  structuredContent: z.record(z.string(), z.unknown()).optional()
});

const SuccessResponseSchema = z.object({
  protocolVersion: z.literal(FORGE_TOOL_ABI_VERSION),
  status: z.literal('ok'),
  result: ToolResultSchema
});

const ErrorResponseSchema = z.object({
  protocolVersion: z.literal(FORGE_TOOL_ABI_VERSION),
  status: z.literal('error'),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional()
  })
});

export const ForgeToolExecutionResponseSchema = z.discriminatedUnion('status', [
  SuccessResponseSchema,
  ErrorResponseSchema
]);

export type ForgeToolExecutionResponse = z.infer<typeof ForgeToolExecutionResponseSchema>;
export type ForgeToolResult = z.infer<typeof ToolResultSchema>;
