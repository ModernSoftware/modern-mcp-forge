import { afterEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  getActiveProjectContext,
  getActiveProjectKey,
  getProjectManifestPath,
  getProjectRoot,
  loadProjectManifest
} from '$lib/server/project/loader';
import {
  clearProjectForProcess,
  getProcessProjectManifestPath,
  selectProjectForProcess
} from '$lib/server/project/project-selection';

import {
  createManifest,
  createTempDirectory,
  removeTempDirectory,
  writeProject
} from '../helpers/project';

let root: string | null = null;

afterEach(() => {
  clearProjectForProcess();

  if (root) {
    removeTempDirectory(root);
    root = null;
  }
});

describe('process project selection and loader', () => {
  test('normalizes a selected manifest path', () => {
    selectProjectForProcess('./relative/forge.project.json');
    expect(getProcessProjectManifestPath()).toBe(resolve('./relative/forge.project.json'));
  });

  test('clears process selection', () => {
    selectProjectForProcess('./forge.project.json');
    clearProjectForProcess();
    expect(getProcessProjectManifestPath()).toBeNull();
  });

  test('loads the process-selected project', () => {
    root = createTempDirectory();
    const manifest = createManifest({ name: 'selected-project' });
    const path = writeProject(root, manifest);
    selectProjectForProcess(path);

    expect(getProjectManifestPath()).toBe(resolve(path));
    expect(getProjectRoot()).toBe(dirname(resolve(path)));
    expect(loadProjectManifest().project.name).toBe('selected-project');
    expect(getActiveProjectKey()).toBe(manifest.project.id);
    expect(getActiveProjectContext()).toEqual({
      id: manifest.project.id,
      name: 'selected-project',
      path: resolve(root),
      manifestPath: resolve(path)
    });
  });

  test('rejects invalid JSON in a selected manifest', () => {
    root = createTempDirectory();
    const path = writeProject(root);
    writeFileSync(path, '{ invalid json', 'utf8');
    selectProjectForProcess(path);

    expect(() => loadProjectManifest()).toThrow();
  });

  test('rejects manifests that violate the project schema', () => {
    root = createTempDirectory();
    const path = writeProject(root);
    const manifest = createManifest();
    const invalid = {
      ...manifest,
      project: {
        name: manifest.project.name
      }
    };

    writeFileSync(path, JSON.stringify(invalid), 'utf8');
    selectProjectForProcess(path);

    expect(() => loadProjectManifest()).toThrow();
  });
});
