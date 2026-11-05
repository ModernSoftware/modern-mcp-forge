import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import { getAvailablePort } from '../helpers/network';

test('retired preview cannot serve MCP without an open project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-preview-retired-'));
  const oldDatabase = process.env.MCP_FORGE_DB_PATH;
  process.env.MCP_FORGE_DB_PATH = join(root, 'forge.db');
  const port = await getAvailablePort();
  const base = `http://127.0.0.1:${port}`;
  const server = await createServer({
    server: { host: '127.0.0.1', port, strictPort: true },
    logLevel: 'error'
  });
  try {
    await server.listen();
    expect(
      (await fetch(`${base}/mcpack`, { redirect: 'manual' })).headers.get(
        'location'
      )
    ).toBe('/projects');
    expect((await fetch(`${base}/api/mcpack`)).status).toBe(410);
    expect(
      (
        await fetch(`${base}/api/mcpack`, {
          headers: { origin: 'https://evil.example' }
        })
      ).status
    ).toBe(403);
    expect(
      (
        await fetch(`${base}/api/mcpack`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'open', manifestPath: 'example.json' })
        })
      ).status
    ).toBe(410);
    expect((await fetch(`${base}/mcp`)).status).toBe(503);
    for (const path of ['/workspace', '/project', '/workspace/new']) {
      expect(
        (await fetch(base + path, { redirect: 'manual' })).headers.get(
          'location'
        )
      ).toBe('/projects');
    }
  } finally {
    const database = await server.ssrLoadModule('/src/lib/server/database.ts');
    database.closeDatabase();
    await server.close();
    if (oldDatabase === undefined) delete process.env.MCP_FORGE_DB_PATH;
    else process.env.MCP_FORGE_DB_PATH = oldDatabase;
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100
    });
  }
}, 30_000);
