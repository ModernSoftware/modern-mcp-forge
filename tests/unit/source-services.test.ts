import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';

import {
  createStarterPromptTemplate,
  getPromptSourceInfo,
  PromptSourceConflictError,
  PromptSourceError,
  readPromptTemplate,
  readPromptTemplateText,
  savePromptTemplate
} from '$lib/server/project/prompt-source-service';

import {
  clearProjectForProcess,
  selectProjectForProcess
} from '$lib/server/project/project-selection';

import {
  createStarterResourceSource,
  getResourceSourceInfo,
  readResourceSource,
  readResourceText,
  ResourceSourceConflictError,
  ResourceSourceError,
  saveResourceSource
} from '$lib/server/project/resource-source-service';

import {
  createStarterSource,
  getToolSourceInfo,
  readToolSource,
  saveToolSource,
  ToolSourceConflictError,
  ToolSourceError
} from '$lib/server/project/source-service';

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
let externalRoot: string;

const nodeTool: ToolDefinition = {
  name: 'node_tool',
  title: 'Node Tool',
  description: 'Node description',
  enabled: true,
  runtime: 'node',
  entrypoint: './tools/node_tool.mjs',
  timeoutMs: 30_000,
  maxOutputBytes: 1024 * 1024,
  arguments: {}
};

const bunTool: ToolDefinition = {
  ...nodeTool,
  name: 'bun_tool',
  runtime: 'bun',
  entrypoint: './tools/bun_tool.ts'
};

const pythonTool: ToolDefinition = {
  ...nodeTool,
  name: 'python_tool',
  runtime: 'python',
  entrypoint: './tools/python_tool.py'
};

const dotnetTool: ToolDefinition = {
  ...nodeTool,
  name: 'dotnet_tool',
  runtime: 'dotnet',
  entrypoint: './tools/dotnet_tool.dll'
};

const markdownResource: ResourceDefinition = {
  name: 'guide',
  title: 'Guide',
  description: 'Guide description',
  enabled: true,
  uri: 'forge://guide',
  mimeType: 'text/markdown',
  source: './resources/guide.md'
};

const jsonResource: ResourceDefinition = {
  ...markdownResource,
  name: 'data',
  uri: 'forge://data',
  mimeType: 'application/json',
  source: './resources/data.json'
};

const prompt: PromptDefinition = {
  name: 'review',
  title: 'Review',
  description: 'Review code',
  enabled: true,
  role: 'user',
  template: './prompts/review.md',
  arguments: {
    language: {
      description: 'Language',
      required: true
    }
  }
};

beforeEach(() => {
  root = createTempDirectory();
  externalRoot = createTempDirectory('modern-mcp-forge-external-');

  const manifest = createManifest({
    tools: [nodeTool, bunTool, pythonTool, dotnetTool],
    resources: [markdownResource, jsonResource],
    prompts: [prompt]
  });

  selectProjectForProcess(writeProject(root, manifest));
});

afterEach(() => {
  clearProjectForProcess();
  removeTempDirectory(root);
  removeTempDirectory(externalRoot);
});

describe('tool source service', () => {
  test.each([
    ['node_tool', 'javascript'],
    ['bun_tool', 'typescript'],
    ['python_tool', 'python']
  ] as const)('detects language for %s', (name, language) => {
    const info = getToolSourceInfo(name);
    expect(info.language).toBe(language);
    expect(info.editable).toBe(true);
    expect(info.external).toBe(false);
    expect(info.exists).toBe(false);
  });

  test('marks dotnet source as non-editable', () => {
    const info = getToolSourceInfo('dotnet_tool');
    expect(info.language).toBe('plaintext');
    expect(info.editable).toBe(false);
  });

  test('creates, reads, and saves a Node starter source', () => {
    const created = createStarterSource('node_tool');

    expect(created.info.exists).toBe(true);
    expect(created.content).toContain('protocolVersion: 1');
    expect(existsSync(join(root, 'tools', 'node_tool.mjs'))).toBe(true);

    const read = readToolSource('node_tool');
    expect(read.content).toBe(created.content);

    saveToolSource('node_tool', 'console.error("updated");');
    expect(readFileSync(join(root, 'tools', 'node_tool.mjs'), 'utf8')).toBe(
      'console.error("updated");'
    );
  });

  test('creates Bun and Python starter sources', () => {
    expect(createStarterSource('bun_tool').content).toContain('Bun.stdin.text()');
    expect(createStarterSource('python_tool').content).toContain('json.loads(sys.stdin.read())');
  });

  test('rejects creating a starter over an existing file', () => {
    createStarterSource('node_tool');
    expect(() => createStarterSource('node_tool')).toThrow(ToolSourceConflictError);
  });

  test('rejects saving a source before it exists', () => {
    expect(() => saveToolSource('node_tool', 'content')).toThrow(ToolSourceError);
  });

  test('rejects starter authoring for dotnet', () => {
    expect(() => createStarterSource('dotnet_tool')).toThrow(ToolSourceError);
  });

  test('rejects unknown tools', () => {
    expect(() => getToolSourceInfo('missing')).toThrow(ToolSourceError);
  });
});

describe('resource source service', () => {
  test('creates, reads, and saves a Markdown resource', () => {
    const created = createStarterResourceSource('guide');

    expect(created.content).toContain('# Guide');
    expect(getResourceSourceInfo('guide').language).toBe('markdown');
    expect(readResourceSource('guide').content).toBe(created.content);
    expect(readResourceText(markdownResource)).toBe(created.content);

    saveResourceSource('guide', '# Updated');
    expect(readResourceSource('guide').content).toBe('# Updated');
  });

  test('creates valid JSON starter content', () => {
    const created = createStarterResourceSource('data');
    expect(() => JSON.parse(created.content)).not.toThrow();
    expect(getResourceSourceInfo('data').language).toBe('json');
  });

  test('returns null content when a declared resource file is missing', () => {
    const result = readResourceSource('guide');
    expect(result.info.exists).toBe(false);
    expect(result.content).toBeNull();
  });

  test('readResourceText rejects a missing file', () => {
    expect(() => readResourceText(markdownResource)).toThrow(ResourceSourceError);
  });

  test('rejects creating over an existing resource file', () => {
    createStarterResourceSource('guide');
    expect(() => createStarterResourceSource('guide')).toThrow(ResourceSourceConflictError);
  });

  test('rejects saving before the resource file exists', () => {
    expect(() => saveResourceSource('guide', 'content')).toThrow(ResourceSourceError);
  });

  test('rejects resources above the text size limit', () => {
    const path = join(root, 'resources', 'guide.md');
    writeFileSync(path, Buffer.alloc(8 * 1024 * 1024 + 1, 65));

    expect(() => readResourceSource('guide')).toThrow(ResourceSourceError);
  });

  test('rejects unknown resources', () => {
    expect(() => getResourceSourceInfo('missing')).toThrow(ResourceSourceError);
  });
});

describe('prompt source service', () => {
  test('creates, reads, and saves a prompt template', () => {
    const created = createStarterPromptTemplate('review');

    expect(created.content).toContain('{{language}}');
    expect(getPromptSourceInfo('review').language).toBe('markdown');
    expect(readPromptTemplate('review').content).toBe(created.content);
    expect(readPromptTemplateText(prompt)).toBe(created.content);

    savePromptTemplate('review', 'Language={{language}}');
    expect(readPromptTemplate('review').content).toBe('Language={{language}}');
  });

  test('returns null content when a declared template is missing', () => {
    const result = readPromptTemplate('review');
    expect(result.info.exists).toBe(false);
    expect(result.content).toBeNull();
  });

  test('readPromptTemplateText rejects a missing file', () => {
    expect(() => readPromptTemplateText(prompt)).toThrow(PromptSourceError);
  });

  test('rejects creating over an existing prompt template', () => {
    createStarterPromptTemplate('review');
    expect(() => createStarterPromptTemplate('review')).toThrow(PromptSourceConflictError);
  });

  test('rejects saving before the template exists', () => {
    expect(() => savePromptTemplate('review', 'content')).toThrow(PromptSourceError);
  });

  test('rejects prompt templates above the size limit', () => {
    const path = join(root, 'prompts', 'review.md');
    writeFileSync(path, Buffer.alloc(1024 * 1024 + 1, 65));

    expect(() => readPromptTemplate('review')).toThrow(PromptSourceError);
  });

  test('rejects unknown prompts', () => {
    expect(() => getPromptSourceInfo('missing')).toThrow(PromptSourceError);
  });
});

describe('external source detection', () => {
  test('detects tool, resource, and prompt files outside the project', () => {
    const externalTool = join(externalRoot, 'tool.mjs');
    const externalResource = join(externalRoot, 'resource.md');
    const externalPrompt = join(externalRoot, 'prompt.md');

    writeFileSync(externalTool, '');
    writeFileSync(externalResource, 'resource');
    writeFileSync(externalPrompt, 'prompt');

    const manifest = createManifest({
      tools: [{ ...nodeTool, entrypoint: externalTool }],
      resources: [{ ...markdownResource, source: externalResource }],
      prompts: [{ ...prompt, template: externalPrompt }]
    });

    selectProjectForProcess(writeProject(root, manifest));

    expect(getToolSourceInfo('node_tool').external).toBe(true);
    expect(getToolSourceInfo('node_tool').projectRelativePath).toBeNull();
    expect(getResourceSourceInfo('guide').external).toBe(true);
    expect(getResourceSourceInfo('guide').projectRelativePath).toBeNull();
    expect(getPromptSourceInfo('review').external).toBe(true);
    expect(getPromptSourceInfo('review').projectRelativePath).toBeNull();
  });
});
