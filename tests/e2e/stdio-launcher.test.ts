import { afterEach, describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import {
  createManifest,
  createTempDirectory,
  removeTempDirectory,
  writeProject
} from '../helpers/project';

const repositoryRoot = resolve(import.meta.dir, '../..');
const script = join(repositoryRoot, 'scripts', 'mcp-stdio.ts');
const created: string[] = [];

async function run(args: string[]) {
  const subprocess = Bun.spawn({
    cmd: [process.execPath, script, ...args],
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited
  ]);

  return { stdout, stderr, exitCode };
}

afterEach(() => {
  while (created.length > 0) {
    removeTempDirectory(created.pop()!);
  }
});

describe('stdio launcher CLI', () => {
  test('requires --project', async () => {
    const result = await run([]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Usage:');
  });

  test('rejects a missing project manifest', async () => {
    const root = createTempDirectory();
    created.push(root);

    const result = await run(['--project', root]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Forge project manifest not found');
  });

  test('rejects an invalid project manifest without polluting stdout', async () => {
    const root = createTempDirectory();
    created.push(root);
    const manifestPath = writeProject(root, createManifest());
    await Bun.write(manifestPath, '{ invalid');

    const result = await run(['--project', root]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Modern MCP Forge stdio server failed');
  });
});
