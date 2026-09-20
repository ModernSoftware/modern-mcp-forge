import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { executeExternalTool } from '$lib/server/execution/process-runner';
import {
  clearProjectForProcess,
  selectProjectForProcess
} from '$lib/server/project/project-selection';
import type { ToolDefinition } from '$lib/server/project/schema';
import { createStarterSource } from '$lib/server/project/source-service';

import {
  createManifest,
  createTempDirectory,
  removeTempDirectory,
  writeProject
} from '../helpers/project';

let root: string;

function definition(
  name: string,
  runtime: ToolDefinition['runtime'],
  entrypoint: string
): ToolDefinition {
  return {
    name,
    description: '',
    enabled: true,
    runtime,
    entrypoint,
    timeoutMs: 5_000,
    maxOutputBytes: 1024 * 1024,
    arguments: {
      text: {
        type: 'string',
        required: false
      }
    }
  };
}

beforeEach(() => {
  root = createTempDirectory('modern-mcp-forge-starters-');

  const tools = [
    definition('bun_starter', 'bun', './tools/bun_starter.ts'),
    definition('node_starter', 'node', './tools/node_starter.mjs'),
    definition('python_starter', 'python', './tools/python_starter.py')
  ];

  selectProjectForProcess(
    writeProject(root, createManifest({ tools }))
  );
});

afterEach(() => {
  clearProjectForProcess();
  removeTempDirectory(root);
});

describe('generated starter tools', () => {
  test('generated Bun starter executes through Forge Tool ABI', async () => {
    const created = createStarterSource('bun_starter');
    expect(created.info.exists).toBe(true);

    const result = await executeExternalTool(
      definition('bun_starter', 'bun', './tools/bun_starter.ts'),
      { text: 'hello' },
      'starter-bun'
    );

    expect(result.result.content[0].text).toContain('bun_starter executed successfully');
    expect(result.result.structuredContent).toMatchObject({
      arguments: {
        text: 'hello'
      }
    });
  });

  test('generated Node starter executes when Node is available', async () => {
    if (!Bun.which('node')) return;

    createStarterSource('node_starter');

    const result = await executeExternalTool(
      definition('node_starter', 'node', './tools/node_starter.mjs'),
      { text: 'hello' },
      'starter-node'
    );

    expect(result.result.content[0].text).toContain('node_starter executed successfully with Node.js');
    expect(result.result.structuredContent).toMatchObject({
      arguments: {
        text: 'hello'
      }
    });
  });

  test('generated Python starter executes when Python is available', async () => {
    const hasPython = Boolean(
      Bun.which('python') || Bun.which('python3') || Bun.which('py')
    );

    if (!hasPython) return;

    createStarterSource('python_starter');

    const result = await executeExternalTool(
      definition('python_starter', 'python', './tools/python_starter.py'),
      { text: 'hello' },
      'starter-python'
    );

    expect(result.result.content[0].text).toContain('python_starter executed successfully');
    expect(result.result.structuredContent).toMatchObject({
      arguments: {
        text: 'hello'
      }
    });
  });

  test('starter files remain inside the project by default', () => {
    const info = createStarterSource('bun_starter').info;
    expect(info.projectRelativePath).toBe(join('tools', 'bun_starter.ts'));
    expect(info.external).toBe(false);
  });
});
