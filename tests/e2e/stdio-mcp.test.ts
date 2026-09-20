import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import type {
  PromptDefinition,
  ResourceDefinition,
  ToolDefinition
} from '$lib/server/project/schema';

import {
  createManifest,
  createTempDirectory,
  removeTempDirectory,
  writeProject
} from '../helpers/project';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const stdioScript = join(repositoryRoot, 'scripts', 'mcp-stdio.ts');

let sandbox: string;
let projectRoot: string;
let previousDatabasePath: string | undefined;

function createTransport(): StdioClientTransport {
  return new StdioClientTransport({
    command: process.execPath,
    args: [stdioScript, '--project', projectRoot],
    cwd: repositoryRoot,
    stderr: 'pipe'
  });
}

async function exerciseClient(client: Client): Promise<void> {
  const tools = await client.listTools();
  const resources = await client.listResources();
  const prompts = await client.listPrompts();

  expect(tools.tools.map((item) => item.name).sort()).toEqual(['advanced_bun', 'echo_bun']);
  expect(resources.resources.map((item) => item.name)).toEqual(['guide']);
  expect(prompts.prompts.map((item) => item.name)).toEqual(['review']);

  const advancedDefinition = tools.tools.find((item) => item.name === 'advanced_bun');
  expect(advancedDefinition?.inputSchema).toMatchObject({
    type: 'object',
    required: ['customer']
  });

  const toolResult = await client.callTool({
    name: 'echo_bun',
    arguments: {
      text: 'hello over stdio'
    }
  });

  expect(toolResult.isError).not.toBe(true);
  expect(toolResult.content[0]).toMatchObject({
    type: 'text',
    text: 'hello over stdio'
  });

  const advancedResult = await client.callTool({
    name: 'advanced_bun',
    arguments: {
      customer: {
        id: 'C-123'
      },
      tags: ['one', 'two']
    }
  });

  expect(advancedResult.isError).not.toBe(true);
  expect(advancedResult.structuredContent).toMatchObject({
    customer: {
      id: 'C-123'
    }
  });

  const resourceResult = await client.readResource({
    uri: 'forge://guide'
  });

  expect(resourceResult.contents[0]).toMatchObject({
    uri: 'forge://guide',
    mimeType: 'text/markdown',
    text: '# Guide\n\nHello from stdio.'
  });

  const promptResult = await client.getPrompt({
    name: 'review',
    arguments: {
      language: 'TypeScript'
    }
  });

  expect(promptResult.messages[0]).toMatchObject({
    role: 'user',
    content: {
      type: 'text',
      text: 'Review TypeScript code.'
    }
  });
}

beforeEach(() => {
  sandbox = createTempDirectory('modern-mcp-forge-stdio-e2e-');
  projectRoot = join(sandbox, 'project');
  previousDatabasePath = process.env.MCP_FORGE_DB_PATH;
  process.env.MCP_FORGE_DB_PATH = join(sandbox, 'forge.db');

  const tool: ToolDefinition = {
    name: 'echo_bun',
    description: 'Echo through Bun',
    enabled: true,
    runtime: 'bun',
    entrypoint: './tools/echo_bun.ts',
    timeoutMs: 5_000,
    maxOutputBytes: 1024 * 1024,
    arguments: {
      text: {
        type: 'string',
        required: true
      }
    }
  };

  const advancedTool: ToolDefinition = {
    ...tool,
    name: 'advanced_bun',
    entrypoint: './tools/advanced_bun.ts',
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
        },
        tags: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    }
  };

  const disabledTool: ToolDefinition = {
    ...tool,
    name: 'disabled_tool',
    enabled: false,
    entrypoint: './tools/disabled.ts'
  };

  const resource: ResourceDefinition = {
    name: 'guide',
    description: 'Guide',
    enabled: true,
    uri: 'forge://guide',
    mimeType: 'text/markdown',
    source: './resources/guide.md'
  };

  const disabledResource: ResourceDefinition = {
    ...resource,
    name: 'disabled_resource',
    enabled: false,
    uri: 'forge://disabled',
    source: './resources/disabled.md'
  };

  const prompt: PromptDefinition = {
    name: 'review',
    description: 'Review code',
    enabled: true,
    role: 'user',
    template: './prompts/review.md',
    arguments: {
      language: {
        required: true
      }
    }
  };

  const disabledPrompt: PromptDefinition = {
    ...prompt,
    name: 'disabled_prompt',
    enabled: false,
    template: './prompts/disabled.md'
  };

  writeProject(
    projectRoot,
    createManifest({
      tools: [tool, advancedTool, disabledTool],
      resources: [resource, disabledResource],
      prompts: [prompt, disabledPrompt]
    })
  );

  mkdirSync(join(projectRoot, 'tools'), { recursive: true });
  writeFileSync(
    join(projectRoot, 'tools', 'echo_bun.ts'),
    `
      const request = JSON.parse(await Bun.stdin.text());
      process.stdout.write(JSON.stringify({
        protocolVersion: 1,
        status: 'ok',
        result: {
          content: [{ type: 'text', text: request.arguments.text }],
          structuredContent: { echoed: request.arguments.text }
        }
      }));
    `,
    'utf8'
  );

  writeFileSync(
    join(projectRoot, 'tools', 'advanced_bun.ts'),
    `
      const request = JSON.parse(await Bun.stdin.text());
      process.stdout.write(JSON.stringify({
        protocolVersion: 1,
        status: 'ok',
        result: {
          content: [{ type: 'text', text: request.arguments.customer.id }],
          structuredContent: request.arguments
        }
      }));
    `,
    'utf8'
  );

  writeFileSync(
    join(projectRoot, 'resources', 'guide.md'),
    '# Guide\n\nHello from stdio.',
    'utf8'
  );

  writeFileSync(
    join(projectRoot, 'prompts', 'review.md'),
    'Review {{language}} code.',
    'utf8'
  );
});

afterEach(() => {
  if (previousDatabasePath === undefined) {
    delete process.env.MCP_FORGE_DB_PATH;
  } else {
    process.env.MCP_FORGE_DB_PATH = previousDatabasePath;
  }

  removeTempDirectory(sandbox);
});

describe('MCP stdio end-to-end', () => {
  test('serves tools, resources, and prompts to modern and classic clients', async () => {
    const modern = new Client(
      {
        name: 'stdio-modern-test',
        version: '1.0.0'
      },
      {
        versionNegotiation: {
          mode: 'auto'
        }
      }
    );

    try {
      await modern.connect(createTransport());
      expect(modern.getProtocolEra()).toBe('modern');
      await exerciseClient(modern);
    } finally {
      await modern.close().catch(() => undefined);
    }

    const classic = new Client({
      name: 'stdio-classic-test',
      version: '1.0.0'
    });

    try {
      await classic.connect(createTransport());
      await exerciseClient(classic);
    } finally {
      await classic.close().catch(() => undefined);
    }
  }, 20_000);
});
