import {
  existsSync,
  readdirSync,
  statSync
} from 'node:fs';

import {
  dirname,
  resolve
} from 'node:path';

import {
  homedir,
  platform
} from 'node:os';

export interface DirectoryBrowserResult {
  path: string;
  parentPath: string | null;
  roots: string[];
  directories: {
    name: string;
    path: string;
  }[];
}

function listWindowsRoots(): string[] {
  const roots: string[] = [];

  for (
    let code = 'A'.charCodeAt(0);
    code <= 'Z'.charCodeAt(0);
    code += 1
  ) {
    const root = `${String.fromCharCode(code)}:\\`;

    if (existsSync(root)) {
      roots.push(root);
    }
  }

  return roots;
}

export function listFilesystemRoots(): string[] {
  return platform() === 'win32' ? listWindowsRoots() : ['/'];
}

export function browseDirectories(requestedPath?: string | null): DirectoryBrowserResult {
  const path = resolve(requestedPath?.trim() || homedir());

  if (!existsSync(path)) {
    throw new Error(`Directory does not exist: ${path}`);
  }

  if (!statSync(path).isDirectory()) {
    throw new Error(`Path is not a directory: ${path}`);
  }

  let entries;

  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `Could not read directory "${path}": ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }

  const directories =
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
          name: entry.name,
          path: resolve(path, entry.name)
        })
      )
      .sort((left, right) => left.name.localeCompare(
        right.name,
        undefined,
        { sensitivity: 'base' }
      ));

  const parent = dirname(path);

  return {
    path,
    parentPath:
      parent === path
        ? null
        : parent,
    roots: listFilesystemRoots(),
    directories
  };
}
