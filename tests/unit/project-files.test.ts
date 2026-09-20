import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { listProjectSourceFiles } from '$lib/server/project/project-files';
import { listProjectPromptFiles } from '$lib/server/project/prompt-files';
import { listProjectResourceFiles } from '$lib/server/project/resource-files';
import {
  clearProjectForProcess,
  selectProjectForProcess
} from '$lib/server/project/project-selection';

import {
  createManifest,
  createTempDirectory,
  removeTempDirectory,
  writeProject
} from '../helpers/project';

let root: string;

function file(relativePath: string): void {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, relativePath, 'utf8');
}

beforeEach(() => {
  root = createTempDirectory();
  const manifestPath = writeProject(root, createManifest());
  selectProjectForProcess(manifestPath);

  file('tools/a.py');
  file('tools/b.ts');
  file('tools/c.js');
  file('tools/d.mjs');
  file('tools/e.cjs');
  file('tools/ignore.cs');
  file('resources/guide.md');
  file('resources/data.json');
  file('resources/readme.txt');
  file('resources/image.png');
  file('prompts/review.md');
  file('prompts/plain.txt');
  file('prompts/ignore.json');
  file('node_modules/ignored.js');
  file('dist/ignored.md');
});

afterEach(() => {
  clearProjectForProcess();
  removeTempDirectory(root);
});

describe('project file discovery', () => {
  test('finds only Python files for Python tools', () => {
    expect(listProjectSourceFiles('python').map((item) => item.name)).toEqual(['a.py']);
  });

  test('finds TypeScript and JavaScript files for Bun tools', () => {
    expect(listProjectSourceFiles('bun').map((item) => item.name).sort()).toEqual([
      'b.ts',
      'c.js',
      'd.mjs',
      'e.cjs'
    ]);
  });

  test('finds JavaScript files for Node tools but not TypeScript', () => {
    expect(listProjectSourceFiles('node').map((item) => item.name).sort()).toEqual([
      'c.js',
      'd.mjs',
      'e.cjs'
    ]);
  });

  test('does not traverse ignored directories', () => {
    expect(listProjectSourceFiles('node').some((item) => item.path.includes('node_modules'))).toBe(false);
  });

  test('returns normalized project-relative paths', () => {
    expect(listProjectSourceFiles('python')[0].path).toBe('./tools/a.py');
  });

  test('finds all supported resource files across the project', () => {
    expect(listProjectResourceFiles().map((item) => item.name).sort()).toEqual([
      'data.json',
      'forge.project.json',
      'guide.md',
      'ignore.json',
      'plain.txt',
      'readme.txt',
      'review.md'
    ].sort());
  });

  test('ignores unsupported resource extensions', () => {
    expect(listProjectResourceFiles().some((item) => item.name === 'image.png')).toBe(false);
  });

  test('finds supported prompt files only', () => {
    expect(listProjectPromptFiles().map((item) => item.name).sort()).toEqual([
      'guide.md',
      'readme.txt',
      'review.md',
      'plain.txt'
    ].sort());
  });

  test('returns sorted paths', () => {
    const paths = listProjectResourceFiles().map((item) => item.path);
    expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)));
  });
});
