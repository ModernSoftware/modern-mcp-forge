import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { closeDatabase } from '$lib/server/database';
import { getHealthStatus } from '$lib/server/health';
import { getMcpRuntimeSummary } from '$lib/server/mcp/runtime-summary';
import {
  clearProjectForProcess,
  selectProjectForProcess
} from '$lib/server/project/project-selection';
import type {
  PromptDefinition,
  ResourceDefinition,
  ToolDefinition
} from '$lib/server/project/schema';
import {
  getWorkbenchPrompt,
  getWorkbenchPrompts
} from '$lib/server/workbench/prompts';
import {
  getWorkbenchResource,
  getWorkbenchResources
} from '$lib/server/workbench/resources';
import {
  getWorkbenchTool,
  getWorkbenchTools
} from '$lib/server/workbench/tools';

import {
  createManifest,
  createTempDirectory,
  removeTempDirectory,
  writeProject
} from '../helpers/project';

let sandbox: string;

beforeEach(() => {
  closeDatabase();
  sandbox = createTempDirectory('modern-mcp-forge-workbench-');
  process.env.MCP_FORGE_DB_PATH = join(sandbox, 'forge.db');

  const tools: ToolDefinition[] = [
    {
      name: 'enabled_tool',
      description: '',
      enabled: true,
      runtime: 'bun',
      entrypoint: './tools/enabled.ts',
      timeoutMs: 30_000,
      maxOutputBytes: 1024 * 1024,
      arguments: {}
    },
    {
      name: 'disabled_tool',
      description: '',
      enabled: false,
      runtime: 'node',
      entrypoint: './tools/disabled.mjs',
      timeoutMs: 30_000,
      maxOutputBytes: 1024 * 1024,
      arguments: {}
    }
  ];

  const resources: ResourceDefinition[] = [
    {
      name: 'resource',
      description: '',
      enabled: false,
      uri: 'forge://resource',
      mimeType: 'text/plain',
      source: './resources/resource.txt'
    }
  ];

  const prompts: PromptDefinition[] = [
    {
      name: 'prompt',
      description: '',
      enabled: false,
      role: 'user',
      template: './prompts/prompt.md',
      arguments: {}
    }
  ];

  const projectRoot = join(sandbox, 'project');
  selectProjectForProcess(
    writeProject(projectRoot, createManifest({ tools, resources, prompts }))
  );
});

afterEach(() => {
  clearProjectForProcess();
  closeDatabase();
  delete process.env.MCP_FORGE_DB_PATH;
  removeTempDirectory(sandbox);
});

describe('workbench and health services', () => {
  test('health reports Bun and database availability', () => {
    const health = getHealthStatus();

    expect(health.status).toBe('ok');
    expect(health.application).toBe('Modern MCP Forge');
    expect(health.runtime).toBe(`Bun ${Bun.version}`);
    expect(health.database).toBe('connected');
    expect(Number.isNaN(Date.parse(health.timestamp))).toBe(false);
  });

  test('workbench tools include enabled and disabled definitions', () => {
    const tools = getWorkbenchTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      'enabled_tool',
      'disabled_tool'
    ]);
    expect(getWorkbenchTool('disabled_tool')?.enabled).toBe(false);
    expect(getWorkbenchTool('missing')).toBeNull();
  });

  test('workbench resources include disabled definitions', () => {
    expect(getWorkbenchResources()).toHaveLength(1);
    expect(getWorkbenchResource('resource')?.enabled).toBe(false);
    expect(getWorkbenchResource('missing')).toBeNull();
  });

  test('workbench prompts include disabled definitions', () => {
    expect(getWorkbenchPrompts()).toHaveLength(1);
    expect(getWorkbenchPrompt('prompt')?.enabled).toBe(false);
    expect(getWorkbenchPrompt('missing')).toBeNull();
  });

  test('runtime summary exposes enabled tools only', () => {
    expect(getMcpRuntimeSummary()).toMatchObject({
      enabledTools: 1,
      tools: [
        {
          name: 'enabled_tool',
          runtime: 'bun'
        }
      ],
      endpoint: '/mcp'
    });
  });
});
