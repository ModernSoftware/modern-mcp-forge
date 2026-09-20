import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  browseDirectories,
  listFilesystemRoots
} from '$lib/server/filesystem/directory-browser';

import {
  createTempDirectory,
  removeTempDirectory
} from '../helpers/project';

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeTempDirectory(created.pop()!);
  }
});

describe('filesystem directory browser', () => {
  test('lists only child directories and sorts them', () => {
    const root = createTempDirectory();
    created.push(root);

    mkdirSync(resolve(root, 'Zulu'));
    mkdirSync(resolve(root, 'alpha'));
    writeFileSync(resolve(root, 'file.txt'), 'ignored');

    const result = browseDirectories(root);

    expect(result.path).toBe(resolve(root));
    expect(result.directories.map((item) => item.name)).toEqual(['alpha', 'Zulu']);
    expect(result.parentPath).toBe(dirname(resolve(root)));
  });

  test('throws when the requested directory does not exist', () => {
    const root = createTempDirectory();
    created.push(root);

    expect(() => browseDirectories(resolve(root, 'missing'))).toThrow(
      'Directory does not exist'
    );
  });

  test('throws when the requested path is a file', () => {
    const root = createTempDirectory();
    created.push(root);
    const file = resolve(root, 'file.txt');
    writeFileSync(file, 'hello');

    expect(() => browseDirectories(file)).toThrow('Path is not a directory');
  });

  test('returns at least one filesystem root', () => {
    expect(listFilesystemRoots().length).toBeGreaterThan(0);
  });
});
