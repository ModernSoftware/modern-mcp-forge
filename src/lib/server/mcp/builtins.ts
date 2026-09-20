import type { CallToolResult } from '@modelcontextprotocol/server';
import type { ForgeProjectManifest } from '$lib/server/project/schema';

export async function executeBuiltinTool(
  handler: string,
  args: Record<string, unknown>,
  manifest: ForgeProjectManifest
): Promise<CallToolResult> {
  switch (handler) {
    case 'builtin.echo': {
      const text = args.text;

      if (typeof text !== 'string') {
        throw new Error('builtin.echo requires a string "text" argument.');
      }

      return {
        content: [{ type: 'text', text }],
        structuredContent: { text }
      };
    }

    case 'builtin.project-info': {
      const info = {
        project: manifest.project.name,
        description: manifest.project.description ?? null,
        server: manifest.server.name,
        version: manifest.server.version,
        enabledTools: manifest.tools.filter((tool) => tool.enabled).map((tool) => tool.name)
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(info, null, 2)
          }
        ],
        structuredContent: info
      };
    }

    default:
      throw new Error(`Unknown builtin tool handler "${handler}".`);
  }
}
