import { describe, expect, test } from 'bun:test';
import { createManifest } from '../helpers/project';

import {
  ForgeProjectManifestSchema,
  PromptDefinitionSchema,
  ResourceDefinitionSchema,
  ToolDefinitionSchema
} from '$lib/server/project/schema';

describe('project schema', () => {
  test('accepts a minimal valid project manifest', () => {
    const manifest = createManifest();
    expect(ForgeProjectManifestSchema.parse(manifest)).toEqual(manifest);
  });

  test('requires project.id to be a UUID', () => {
    const manifest = createManifest();
    manifest.project.id = 'not-a-uuid';

    expect(() => ForgeProjectManifestSchema.parse(manifest)).toThrow();
  });

  test('requires schemaVersion 1', () => {
    const manifest = {
      ...createManifest(),
      schemaVersion: 2
    };

    expect(() => ForgeProjectManifestSchema.parse(manifest)).toThrow();
  });

  test('defaults missing capability arrays', () => {
    const manifest = createManifest();
    const parsed = ForgeProjectManifestSchema.parse({
      schemaVersion: manifest.schemaVersion,
      project: manifest.project,
      server: manifest.server
    });

    expect(parsed.tools).toEqual([]);
    expect(parsed.resources).toEqual([]);
    expect(parsed.prompts).toEqual([]);
  });
});

describe('tool schema', () => {
  test.each(['bun', 'node', 'python', 'dotnet'] as const)(
    'accepts runtime %s',
    (runtime) => {
      const tool = ToolDefinitionSchema.parse({
        name: 'example',
        runtime,
        entrypoint: './tools/example.js'
      });

      expect(tool.runtime).toBe(runtime);
      expect(tool.enabled).toBe(true);
      expect(tool.timeoutMs).toBe(30_000);
      expect(tool.maxOutputBytes).toBe(1024 * 1024);
      expect(tool.arguments).toEqual({});
    }
  );

  test('rejects the removed builtin runtime', () => {
    expect(() => ToolDefinitionSchema.parse({
      name: 'example',
      runtime: 'builtin',
      entrypoint: './tools/example.js'
    })).toThrow();
  });

  test('requires an entrypoint', () => {
    expect(() => ToolDefinitionSchema.parse({
      name: 'example',
      runtime: 'node'
    })).toThrow();
  });

  test('rejects non-positive timeout values', () => {
    expect(() => ToolDefinitionSchema.parse({
      name: 'example',
      runtime: 'node',
      entrypoint: './tool.js',
      timeoutMs: 0
    })).toThrow();
  });

  test('rejects timeout values above five minutes', () => {
    expect(() => ToolDefinitionSchema.parse({
      name: 'example',
      runtime: 'node',
      entrypoint: './tool.js',
      timeoutMs: 300_001
    })).toThrow();
  });

  test('rejects output limits above 16 MB', () => {
    expect(() => ToolDefinitionSchema.parse({
      name: 'example',
      runtime: 'node',
      entrypoint: './tool.js',
      maxOutputBytes: 16 * 1024 * 1024 + 1
    })).toThrow();
  });

  test('accepts flat argument fields', () => {
    const tool = ToolDefinitionSchema.parse({
      name: 'example',
      runtime: 'node',
      entrypoint: './tool.js',
      arguments: {
        name: {
          type: 'string',
          required: true
        },
        count: {
          type: 'number'
        },
        enabled: {
          type: 'boolean'
        }
      }
    });

    expect(tool.arguments.name.required).toBe(true);
    expect(tool.arguments.count.required).toBe(false);
  });

  test('requires inputSchema in json-schema mode', () => {
    expect(() => ToolDefinitionSchema.parse({
      name: 'example',
      runtime: 'node',
      entrypoint: './tool.js',
      argumentsMode: 'json-schema'
    })).toThrow();
  });

  test('requires object root in json-schema mode', () => {
    expect(() => ToolDefinitionSchema.parse({
      name: 'example',
      runtime: 'node',
      entrypoint: './tool.js',
      argumentsMode: 'json-schema',
      inputSchema: {
        type: 'array'
      }
    })).toThrow();
  });

  test('accepts nested JSON Schema', () => {
    const tool = ToolDefinitionSchema.parse({
      name: 'example',
      runtime: 'node',
      entrypoint: './tool.js',
      argumentsMode: 'json-schema',
      inputSchema: {
        type: 'object',
        properties: {
          customer: {
            type: 'object',
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
    });

    expect(tool.inputSchema?.type).toBe('object');
  });
});

describe('resource schema', () => {
  test('provides sensible defaults', () => {
    const resource = ResourceDefinitionSchema.parse({
      name: 'guide',
      uri: 'forge://guide',
      source: './resources/guide.md'
    });

    expect(resource.enabled).toBe(true);
    expect(resource.description).toBe('');
    expect(resource.mimeType).toBe('text/plain');
  });

  test('requires a source path', () => {
    expect(() => ResourceDefinitionSchema.parse({
      name: 'guide',
      uri: 'forge://guide'
    })).toThrow();
  });
});

describe('prompt schema', () => {
  test('defaults role to user', () => {
    const prompt = PromptDefinitionSchema.parse({
      name: 'review',
      template: './prompts/review.md'
    });

    expect(prompt.role).toBe('user');
    expect(prompt.enabled).toBe(true);
    expect(prompt.arguments).toEqual({});
  });

  test('accepts assistant role and arguments', () => {
    const prompt = PromptDefinitionSchema.parse({
      name: 'review',
      role: 'assistant',
      template: './prompts/review.md',
      arguments: {
        language: {
          required: true,
          description: 'Language'
        }
      }
    });

    expect(prompt.role).toBe('assistant');
    expect(prompt.arguments.language.required).toBe(true);
  });

  test('rejects unknown roles', () => {
    expect(() => PromptDefinitionSchema.parse({
      name: 'review',
      role: 'system',
      template: './prompts/review.md'
    })).toThrow();
  });
});
