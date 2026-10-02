import {
  fromJsonSchema,
  type McpServer,
  type CallToolResult,
  type ReadResourceResult,
  type GetPromptResult
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { ForgeProjectManifest } from '../project/schema';
import { projectSources } from './manager';
import { projectCatalog } from './catalog';

export function registerNativeSources(
  server: McpServer,
  manifest: ForgeProjectManifest
) {
  const { snapshot, catalogs } = projectCatalog(manifest);
  for (const source of catalogs) {
    const invoke = (
      kind: 'tool' | 'resource' | 'prompt',
      name: string,
      args: Record<string, unknown>,
      signal?: AbortSignal
    ) =>
      projectSources.invoke(
        manifest.project.id,
        snapshot.generation,
        source.id,
        { kind, name, arguments: args, signal }
      );
    for (const tool of source.catalog.tools) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: fromJsonSchema<Record<string, unknown>>(
            tool.inputSchema as Parameters<typeof fromJsonSchema>[0]
          )
        },
        async (args, context) =>
          (await invoke(
            'tool',
            tool.name,
            args,
            context.mcpReq.signal
          )) as CallToolResult
      );
    }
    for (const resource of source.catalog.resources) {
      server.registerResource(
        resource.name,
        resource.uri,
        {
          description: resource.description,
          mimeType: resource.mimeType
        },
        async (_uri, context) =>
          (await invoke(
            'resource',
            resource.uri,
            {},
            context.mcpReq.signal
          )) as ReadResourceResult
      );
    }
    for (const prompt of source.catalog.prompts) {
      const shape: Record<string, z.ZodType> = {};
      for (const arg of prompt.arguments ?? []) {
        const value = z.string().describe(arg.description ?? '');
        Object.defineProperty(shape, arg.name, {
          value: arg.required ? value : value.optional(),
          enumerable: true
        });
      }
      server.registerPrompt(
        prompt.name,
        { description: prompt.description, argsSchema: z.object(shape) },
        async (args, context) =>
          (await invoke(
            'prompt',
            prompt.name,
            Object.fromEntries(
              Object.entries(args).filter(([, value]) => value !== undefined)
            ),
            context.mcpReq.signal
          )) as GetPromptResult
      );
    }
  }
}
