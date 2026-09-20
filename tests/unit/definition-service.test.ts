import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  getDefinition,
  listDefinitions
} from '$lib/server/project/definition-service';

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
  createManifest,
  createTempDirectory,
  removeTempDirectory,
  writeProject
} from '../helpers/project';

let root: string;

beforeEach(() => {
  root = createTempDirectory();

  const tool: ToolDefinition = {
    name: 'tool',
    description: '',
    enabled: true,
    runtime: 'bun',
    entrypoint: './tools/tool.ts',
    timeoutMs: 30_000,
    maxOutputBytes: 1024 * 1024,
    arguments: {}
  };

  const resource: ResourceDefinition = {
    name: 'resource',
    description: '',
    enabled: true,
    uri: 'forge://resource',
    mimeType: 'text/plain',
    source: './resources/resource.txt'
  };

  const prompt: PromptDefinition = {
    name: 'prompt',
    description: '',
    enabled: true,
    role: 'user',
    template: './prompts/prompt.md',
    arguments: {}
  };

  selectProjectForProcess(
    writeProject(root, createManifest({
      tools: [tool],
      resources: [resource],
      prompts: [prompt]
    }))
  );
});

afterEach(() => {
  clearProjectForProcess();
  removeTempDirectory(root);
});

describe('definition service', () => {
  test.each([
    ['tool', 'tool'],
    ['resource', 'resource'],
    ['prompt', 'prompt']
  ] as const)('finds a %s definition', (kind, name) => {
    expect(getDefinition(kind, name)?.name).toBe(name);
  });

  test.each(['tool', 'resource', 'prompt'] as const)(
    'returns null for a missing %s',
    (kind) => {
      expect(getDefinition(kind, 'missing')).toBeNull();
    }
  );

  test('lists all definition groups', () => {
    const definitions = listDefinitions();
    expect(definitions.tools).toHaveLength(1);
    expect(definitions.resources).toHaveLength(1);
    expect(definitions.prompts).toHaveLength(1);
  });
});
