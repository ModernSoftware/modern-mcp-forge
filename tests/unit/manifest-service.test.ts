import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  addPromptToManifest,
  addResourceToManifest,
  addToolToManifest,
  deleteDefinitionFromManifest,
  ManifestAuthoringError,
  ManifestConflictError,
  ManifestDefinitionNotFoundError,
  setDefinitionEnabled,
  updateDefinitionInManifest
} from '$lib/server/project/manifest-service';
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
let manifestPath: string;

function readManifest() {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function nodeTool(name = 'tool_a'): ToolDefinition {
  return {
    name,
    title: 'Tool A',
    description: 'A tool',
    enabled: true,
    runtime: 'node',
    entrypoint: `./tools/${name}.mjs`,
    timeoutMs: 30_000,
    maxOutputBytes: 1024 * 1024,
    arguments: {}
  };
}

function resource(name = 'resource_a', uri = `forge://${name}`): ResourceDefinition {
  return {
    name,
    title: 'Resource A',
    description: 'A resource',
    enabled: true,
    uri,
    mimeType: 'text/markdown',
    source: `./resources/${name}.md`
  };
}

function prompt(name = 'prompt_a'): PromptDefinition {
  return {
    name,
    title: 'Prompt A',
    description: 'A prompt',
    enabled: true,
    role: 'user',
    template: `./prompts/${name}.md`,
    arguments: {}
  };
}

beforeEach(() => {
  root = createTempDirectory();
  manifestPath = writeProject(root, createManifest());
  selectProjectForProcess(manifestPath);
});

afterEach(() => {
  clearProjectForProcess();
  removeTempDirectory(root);
});

describe('manifest authoring', () => {
  test('adds a tool', async () => {
    const added = await addToolToManifest(nodeTool());

    expect(added.name).toBe('tool_a');
    expect(readManifest().tools).toHaveLength(1);
  });

  test('rejects duplicate tool names', async () => {
    await addToolToManifest(nodeTool());

    await expect(addToolToManifest(nodeTool())).rejects.toBeInstanceOf(
      ManifestConflictError
    );
  });

  test('rejects dotnet authoring until the runtime exists', async () => {
    await expect(addToolToManifest({
      ...nodeTool(),
      runtime: 'dotnet',
      entrypoint: './tools/example.dll'
    })).rejects.toBeInstanceOf(ManifestAuthoringError);
  });

  test('rejects invalid tool names', async () => {
    await expect(addToolToManifest({
      ...nodeTool('bad name')
    })).rejects.toBeInstanceOf(ManifestAuthoringError);
  });

  test('adds a resource', async () => {
    await addResourceToManifest(resource());
    expect(readManifest().resources).toHaveLength(1);
  });

  test('rejects duplicate resource names', async () => {
    await addResourceToManifest(resource());

    await expect(addResourceToManifest(resource())).rejects.toBeInstanceOf(
      ManifestConflictError
    );
  });

  test('rejects duplicate resource URIs', async () => {
    await addResourceToManifest(resource('resource_a', 'forge://same'));

    await expect(
      addResourceToManifest(resource('resource_b', 'forge://same'))
    ).rejects.toBeInstanceOf(ManifestConflictError);
  });

  test('rejects invalid resource URIs', async () => {
    await expect(
      addResourceToManifest(resource('resource_a', 'not an absolute uri'))
    ).rejects.toBeInstanceOf(ManifestAuthoringError);
  });

  test('adds a prompt', async () => {
    await addPromptToManifest(prompt());
    expect(readManifest().prompts).toHaveLength(1);
  });

  test('rejects duplicate prompt names', async () => {
    await addPromptToManifest(prompt());

    await expect(addPromptToManifest(prompt())).rejects.toBeInstanceOf(
      ManifestConflictError
    );
  });

  test('rejects invalid prompt argument names', async () => {
    await expect(addPromptToManifest({
      ...prompt(),
      arguments: {
        'bad argument': {
          required: true
        }
      }
    })).rejects.toBeInstanceOf(ManifestAuthoringError);
  });

  test('updates a tool while preserving its runtime', async () => {
    await addToolToManifest(nodeTool());

    const updated = await updateDefinitionInManifest('tool', 'tool_a', {
      ...nodeTool(),
      title: 'Updated',
      timeoutMs: 12_345
    });

    expect(updated.title).toBe('Updated');
    expect(readManifest().tools[0].timeoutMs).toBe(12_345);
  });

  test('rejects in-place tool renames', async () => {
    await addToolToManifest(nodeTool());

    await expect(
      updateDefinitionInManifest('tool', 'tool_a', nodeTool('tool_b'))
    ).rejects.toBeInstanceOf(ManifestAuthoringError);
  });

  test('rejects in-place runtime changes', async () => {
    await addToolToManifest(nodeTool());

    await expect(updateDefinitionInManifest('tool', 'tool_a', {
      ...nodeTool(),
      runtime: 'python',
      entrypoint: './tools/tool_a.py'
    })).rejects.toBeInstanceOf(ManifestAuthoringError);
  });

  test('rejects an update for a missing definition', async () => {
    await expect(
      updateDefinitionInManifest('tool', 'missing', nodeTool('missing'))
    ).rejects.toBeInstanceOf(ManifestDefinitionNotFoundError);
  });

  test('rejects changing a resource URI to another resource URI', async () => {
    await addResourceToManifest(resource('one', 'forge://one'));
    await addResourceToManifest(resource('two', 'forge://two'));

    await expect(updateDefinitionInManifest(
      'resource',
      'two',
      resource('two', 'forge://one')
    )).rejects.toBeInstanceOf(ManifestConflictError);
  });

  test.each([
    ['tool', nodeTool()] as const,
    ['resource', resource()] as const,
    ['prompt', prompt()] as const
  ])('disables and re-enables a %s', async (kind, definition) => {
    if (kind === 'tool') await addToolToManifest(definition);
    if (kind === 'resource') await addResourceToManifest(definition);
    if (kind === 'prompt') await addPromptToManifest(definition);

    const disabled = await setDefinitionEnabled(kind, definition.name, false);
    expect(disabled.enabled).toBe(false);

    const enabled = await setDefinitionEnabled(kind, definition.name, true);
    expect(enabled.enabled).toBe(true);
  });

  test('rejects toggling a missing definition', async () => {
    await expect(
      setDefinitionEnabled('tool', 'missing', false)
    ).rejects.toBeInstanceOf(ManifestDefinitionNotFoundError);
  });

  test.each([
    ['tool', nodeTool()] as const,
    ['resource', resource()] as const,
    ['prompt', prompt()] as const
  ])('deletes a %s definition', async (kind, definition) => {
    if (kind === 'tool') await addToolToManifest(definition);
    if (kind === 'resource') await addResourceToManifest(definition);
    if (kind === 'prompt') await addPromptToManifest(definition);

    await deleteDefinitionFromManifest(kind, definition.name);

    expect(readManifest()[`${kind}s`]).toHaveLength(0);
  });

  test('rejects deleting a missing definition', async () => {
    await expect(
      deleteDefinitionFromManifest('prompt', 'missing')
    ).rejects.toBeInstanceOf(ManifestDefinitionNotFoundError);
  });

  test('serializes concurrent manifest writes without losing definitions', async () => {
    await Promise.all([
      addToolToManifest(nodeTool('one')),
      addToolToManifest(nodeTool('two')),
      addToolToManifest(nodeTool('three'))
    ]);

    expect(
      readManifest().tools.map((item: ToolDefinition) => item.name).sort()
    ).toEqual(['one', 'three', 'two']);
  });
});
