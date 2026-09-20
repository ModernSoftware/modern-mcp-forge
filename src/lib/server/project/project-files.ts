import { readdirSync } from 'node:fs';
import { getProjectRoot } from '$lib/server/project/loader';

import {
  extname,
  join,
  relative,
  sep
} from 'node:path';

export interface ProjectSourceFile {
  path: string;
  name: string;
  extension: string;
}

const ignoredDirectories = new Set([
  '.git',
  '.svelte-kit',
  '.vite',
  'node_modules',
  'data',
  'build',
  'dist',
  'coverage'
]);

const extensionsByRuntime: Record<'python' | 'bun' | 'node', Set<string>> = {
  python: new Set(['.py']),
  bun: new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs'
  ]),
  node: new Set([
    '.js',
    '.mjs',
    '.cjs'
  ])
};

const MAX_FILES = 750;
const MAX_DEPTH = 12;

function normalizeProjectPath(path: string): string {
  return `./${path.split(sep).join('/')}`;
}

export function listProjectSourceFiles(runtime: 'python' | 'bun' | 'node'): ProjectSourceFile[] {
  const projectRoot = getProjectRoot();
  const extensions = extensionsByRuntime[runtime];
  const result: ProjectSourceFile[] = [];

  function visit(directory: string, depth: number): void {
    if (depth > MAX_DEPTH || result.length >= MAX_FILES) {
      return;
    }

    const entries = readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (result.length >= MAX_FILES) {
        return;
      }

      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
        continue;
      }

      const absolute = join(directory, entry.name);

      if (entry.isDirectory()) {
        visit(absolute, depth + 1);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = extname(entry.name).toLowerCase();

      if (!extensions.has(extension)) {
        continue;
      }

      const projectRelative = relative(projectRoot, absolute);

      result.push({
        path: normalizeProjectPath(projectRelative),
        name: entry.name,
        extension
      });
    }
  }

  visit(projectRoot, 0);

  return result.sort((left, right) =>
    left.path.localeCompare(right.path)
  );
}
