import { expect, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { installedMCPackCli } from '../../src/lib/server/mcpack/session';
import { getAvailablePort } from '../helpers/network';

const cli = installedMCPackCli();
test.skipIf(!existsSync(cli))(
  'native workbench edits the deployed files and exposes them through HTTP MCP',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'forge-native-http-'));
    const oldDatabase = process.env.MCP_FORGE_DB_PATH;
    process.env.MCP_FORGE_DB_PATH = join(root, 'forge.db');
    const projectRoot = join(root, 'native');
    await cp(join(dirname(dirname(cli)), 'examples', 'hello'), projectRoot, { recursive: true });
    const port = await getAvailablePort();
    const base = `http://127.0.0.1:${port}`;
    const server = await createServer({
      server: { host: '127.0.0.1', port, strictPort: true },
      logLevel: 'error'
    });
    let client: Client | undefined;
    async function action(body: object) {
      const response = await fetch(`${base}/api/mcpack`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      return { status: response.status, body: (await response.json()) as any };
    }
    try {
      await server.listen();
      expect((await fetch(`${base}/mcpack`)).status).toBe(200);
      const blocked = await fetch(`${base}/api/mcpack`, {
        headers: { origin: 'https://evil.example' }
      });
      expect(blocked.status).toBe(403);
      const opened = await action({
        action: 'open',
        manifestPath: join(projectRoot, 'mcpack.json')
      });
      expect(opened.status).toBe(200);
      expect({
        status: opened.body.project.status,
        error: opened.body.project.error,
        diagnostics: opened.body.project.diagnostics
      }).toMatchObject({ status: 'ready' });
      const project = opened.body.project.manifestPath;
      client = new Client(
        { name: 'native-http', version: '1' },
        { versionNegotiation: { mode: 'auto' } }
      );
      await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
      expect((await client.listTools()).tools.map((item) => item.name)).toEqual(['greet']);
      expect(
        (await client.callTool({ name: 'greet', arguments: { name: 'Diego' } })).content
      ).toEqual([{ type: 'text', text: 'Hello, Diego!' }]);
      expect((await client.readResource({ uri: 'mcpack://hello/guide' })).contents.length).toBe(1);
      expect(
        (await client.getPrompt({ name: 'welcome', arguments: { name: 'Diego' } })).messages.length
      ).toBe(1);
      const file = await action({
        action: 'read',
        project,
        path: join(projectRoot, 'handlers.mjs')
      });
      expect(file.status).toBe(200);
      const saved = await action({
        action: 'save',
        project,
        path: file.body.source.path,
        revision: file.body.source.revision,
        content: file.body.source.content.replace('Hello', 'Howdy')
      });
      expect(saved.body.project.status).toBe('ready');
      // Greeting is configured in JSON; edit the real manifest and reconnect.
      const manifest = await action({ action: 'read', project, path: project });
      const changed = await action({
        action: 'save',
        project,
        path: project,
        revision: manifest.body.source.revision,
        content: manifest.body.source.content.replace('Hello', 'Hola')
      });
      expect(changed.body.project.status).toBe('ready');
      await client.close();
      client = new Client(
        { name: 'native-http-after-edit', version: '1' },
        { versionNegotiation: { mode: 'auto' } }
      );
      await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
      expect(
        (await client.callTool({ name: 'greet', arguments: { name: 'Diego' } })).content
      ).toEqual([{ type: 'text', text: 'Hola, Diego!' }]);
      const conflict = await action({
        action: 'save',
        project,
        path: project,
        revision: manifest.body.source.revision,
        content: manifest.body.source.content
      });
      expect(conflict.status).toBe(409);
      await client.close();
      client = undefined;
      const classic = await fetch(`${base}/api/projects/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ folderPath: join(root, 'classic'), name: 'Classic' })
      });
      expect(classic.status).toBe(201);
      const status = (await fetch(`${base}/api/mcpack`).then((r) => r.json())) as any;
      expect(status.project).toBeNull();
      await fetch(`${base}/api/projects/close`, { method: 'POST' });
      expect((await fetch(`${base}/mcp`)).status).toBe(503);
    } finally {
      await client?.close();
      const manager = await server.ssrLoadModule('/src/lib/server/mcpack/session.ts');
      await manager.nativeProjects.close();
      const database = await server.ssrLoadModule('/src/lib/server/database.ts');
      database.closeDatabase();
      await server.close();
      if (oldDatabase === undefined) delete process.env.MCP_FORGE_DB_PATH;
      else process.env.MCP_FORGE_DB_PATH = oldDatabase;
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  },
  60_000
);
