import { readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { NativeProjectError } from '../mcpack/session';

export function containedFile(root: string, filename: string) {
  if (
    /^(?:[A-Za-z]:|[\\/])/.test(filename) ||
    filename.split(/[\\/]/).includes('..')
  ) {
    throw new NativeProjectError(
      'Use a relative path inside the source folder.'
    );
  }
  const canonicalRoot = realpathSync(root);
  const path = realpathSync(
    resolve(canonicalRoot, filename.replaceAll('\\', '/'))
  );
  const rel = relative(canonicalRoot, path);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new NativeProjectError('File resolves outside the source folder.');
  }
  return path;
}

export function applicationRoot(projectRoot: string, checkoutEnv?: string) {
  if (!checkoutEnv) return projectRoot;
  const path = process.env[checkoutEnv];
  if (
    !path ||
    !isAbsolute(path) ||
    !statSync(path, { throwIfNoEntry: false })?.isDirectory()
  )
    throw new Error(
      `Set ${checkoutEnv} to the absolute path of the application checkout before starting Forge.`
    );
  return path;
}

export function sourcePath(
  root: string,
  path: string,
  label: string,
  directory = false
) {
  let resolved: string;
  try {
    resolved = containedFile(root, path);
  } catch (error) {
    if (
      !['ENOENT', 'ENOTDIR'].includes(
        (error as NodeJS.ErrnoException).code ?? ''
      )
    )
      throw error;
    throw new Error(
      `${label} was not found: ${path}. Browse to select an existing ${directory ? 'folder' : 'file'}.`
    );
  }
  const info = statSync(resolved);
  if (directory ? !info.isDirectory() : !info.isFile())
    throw new Error(
      `${label} must be a ${directory ? 'folder' : 'file'}: ${path}.`
    );
  return resolved;
}

export function browseSourcePaths(
  root: string,
  directory: string,
  kind: 'file' | 'manifest' | 'directory'
) {
  const base = containedFile(root, '.');
  const current = sourcePath(base, directory || '.', 'Folder', true);
  const path = relative(base, current).split(sep).join('/');
  const entries = readdirSync(current, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() ||
        (entry.isFile() &&
          kind !== 'directory' &&
          (kind !== 'manifest' || entry.name.toLowerCase().endsWith('.json')))
    )
    .map((entry) => ({
      name: entry.name,
      directory: entry.isDirectory(),
      path: posix.join(path, entry.name)
    }))
    .sort(
      (a, b) =>
        Number(b.directory) - Number(a.directory) ||
        a.name.localeCompare(b.name)
    );
  return {
    root: base,
    path,
    parent: path ? posix.dirname(path) : null,
    entries
  };
}
