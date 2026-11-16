import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  browseSourcePaths,
  sourcePath
} from '../../src/lib/server/filesystem/source-paths';

test('selection returns portable paths and confines folders to the active root', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'forge picker '));
  const root = join(temp, 'project');
  try {
    await mkdir(join(root, 'native'), { recursive: true });
    await writeFile(join(root, 'native', 'mcpack.json'), '{}');
    await writeFile(join(root, 'native', 'handler.mjs'), '');
    const folder = browseSourcePaths(root, 'native', 'manifest');
    expect(folder.entries.map((e) => e.path)).toEqual(['native/mcpack.json']);
    expect(browseSourcePaths(root, '.', 'directory').parent).toBeNull();
    expect(() => browseSourcePaths(root, '..', 'file')).toThrow('relative');
    expect(() =>
      sourcePath(root, 'native/missing.mjs', 'Adapter file')
    ).toThrow('Adapter file was not found');
    expect(() =>
      sourcePath(root, 'native/handler.mjs', 'Working directory', true)
    ).toThrow('must be a folder');
    await symlink(
      temp,
      join(root, 'escape'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    expect(() => browseSourcePaths(root, 'escape', 'directory')).toThrow(
      'outside'
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
