import { McpServer } from '@modelcontextprotocol/server';

import { executeToolDefinition } from '$lib/server/execution/tool-execution-service';
import { buildToolInputSchema } from '$lib/server/mcp/input-schema';
import { buildPromptArgsSchema } from '$lib/server/mcp/prompt-schema';
import { loadProjectManifest } from '$lib/server/project/loader';
import {
  readPromptTemplateText,
  renderPromptTemplate
} from '$lib/server/project/prompt-source-service';
import { readResourceText } from '$lib/server/project/resource-source-service';

export function createForgeMcpServer(): McpServer {
  const manifest = loadProjectManifest();
  const server = new McpServer(
    {
      name: manifest.server.name,
      version: manifest.server.version
    },
    {
      instructions: manifest.server.instructions
    }
  );

  for (const definition of manifest.tools) {
    if (!definition.enabled) {
      continue;
    }

    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: buildToolInputSchema(definition)
      },
      async (args) => (
        await executeToolDefinition(
          definition,
          args as Record<string, unknown>
        )
      ).result
    );
  }

  for (const definition of manifest.resources) {
    if (!definition.enabled) {
      continue;
    }

    server.registerResource(
      definition.name,
      definition.uri,
      {
        title: definition.title,
        description: definition.description,
        mimeType: definition.mimeType
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: definition.mimeType,
            text: readResourceText(definition)
          }
        ]
      })
    );
  }

  for (const definition of manifest.prompts) {
    if (!definition.enabled) {
      continue;
    }

    server.registerPrompt(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        argsSchema: buildPromptArgsSchema(definition)
      },
      async (args) => {
        const template = readPromptTemplateText(definition);
        const values = args as Record<string, string | undefined>;

        return {
          description: definition.description,
          messages: [
            {
              role: definition.role,
              content: {
                type: 'text',
                text: renderPromptTemplate(template, values)
              }
            }
          ]
        };
      }
    );
  }

  return server;
}
