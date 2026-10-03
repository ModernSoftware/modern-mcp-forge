import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import {
  Client,
  StreamableHTTPClientTransport
} from '@modelcontextprotocol/client';
import { getAvailablePort } from '../helpers/network';

test('project native authoring exposes Node and Python over HTTP and recovers after failed edits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-native-ui-'));
  const oldDatabase = process.env.MCP_FORGE_DB_PATH;
  process.env.MCP_FORGE_DB_PATH = join(root, 'forge.db');
  const port = await getAvailablePort();
  const base = `http://127.0.0.1:${port}`;
  const server = await createServer({
    server: { host: '127.0.0.1', port, strictPort: true },
    logLevel: 'error'
  });
  const clients: Client[] = [];
  let projectId = '';
  let generation = 0;
  async function post(path: string, body: object, origin?: string) {
    const response = await fetch(`${base}/api/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(origin ? { origin } : {})
      },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: (await response.json()) as any };
  }
  async function action(body: object, origin?: string) {
    const response = await post(
      'project/native',
      { projectId, generation, ...body },
      origin
    );
    if (response.body.snapshot) generation = response.body.snapshot.generation;
    return response;
  }
  async function connect() {
    const client = new Client({ name: 'native-authoring-test', version: '1' });
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`))
    );
    return client;
  }
  try {
    await server.listen();
    const created = await post('projects/create', {
      folderPath: join(root, 'project'),
      name: 'Authoring'
    });
    projectId = created.body.project.id;
    generation = (
      (await fetch(`${base}/api/project/sources`).then((r) => r.json())) as any
    ).generation;
    expect(
      (
        await action(
          { action: 'create', id: 'js', runtime: 'node' },
          'https://evil.example'
        )
      ).status
    ).toBe(403);
    expect(
      (
        await action({
          action: 'create',
          id: 'js',
          runtime: 'node',
          projectId: 'stale'
        })
      ).status
    ).toBe(409);
    expect(
      (await action({ action: 'create', id: 'js', runtime: 'node' })).body
        .snapshot.status
    ).toBe('ready');
    expect(
      (await action({ action: 'create', id: 'py', runtime: 'python' })).body
        .snapshot.status
    ).toBe('ready');
    for (const path of [
      '/project',
      '/tools',
      '/resources',
      '/prompts',
      '/project/native/js'
    ]) {
      const response = await fetch(base + path);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(
        path === '/project/native/js' ? 'Manifest and handlers' : 'native'
      );
    }
    await writeFile(
      join(root, 'project/resources/classic.txt'),
      'Classic guide'
    );
    const classic = await server.ssrLoadModule(
      '/src/lib/server/project/manifest-service.ts'
    );
    await classic.addResourceToManifest({
      name: 'classic',
      uri: 'forge://classic',
      source: 'resources/classic.txt'
    });
    const client = await connect();
    expect(
      (await client.readResource({ uri: 'forge://classic' })).contents[0]
    ).toMatchObject({ text: 'Classic guide' });
    expect(
      (await client.listTools()).tools.map((item) => item.name).sort()
    ).toEqual(['js_greet', 'py_greet']);
    expect(
      (
        await client.callTool({
          name: 'py_greet',
          arguments: { name: 'Diego' }
        })
      ).content
    ).toEqual([{ type: 'text', text: 'Hello, Diego!' }]);
    expect(
      (await client.readResource({ uri: 'mcpack://js/guide' })).contents[0]
    ).toMatchObject({ text: 'Your native MCPack guide.' });
    expect(
      (
        await client.getPrompt({
          name: 'py_welcome',
          arguments: { name: 'Diego' }
        })
      ).messages[0].content
    ).toMatchObject({ text: 'Welcome Diego' });
    expect(
      (await client.callTool({ name: 'js_greet', arguments: {} })).isError
    ).toBe(true);
    const file = (
      await action({
        action: 'read',
        id: 'js',
        path: 'native/js/handlers.mjs',
        generation: undefined
      })
    ).body.file;
    expect(file.content).toContain('Hello, ');
    expect(
      (
        await action({
          action: 'save',
          id: 'js',
          path: file.path,
          revision: 'wrong',
          content: 'broken'
        })
      ).status
    ).toBe(409);
    const oldGeneration = generation;
    const saved = await action({
      action: 'save',
      id: 'js',
      path: file.path,
      revision: file.revision,
      content: file.content.replace('Hello, ', 'Welcome, ')
    });
    expect(saved.body.snapshot.status).toBe('ready');
    expect(
      (
        await action({
          action: 'invoke',
          id: 'js',
          generation: oldGeneration,
          kind: 'tool',
          name: 'js_greet',
          arguments: { name: 'stale' }
        })
      ).status
    ).toBe(409);
    const refreshed = await connect();
    expect(
      (
        await refreshed.callTool({
          name: 'js_greet',
          arguments: { name: 'Diego' }
        })
      ).content
    ).toEqual([{ type: 'text', text: 'Welcome, Diego!' }]);
    const failed = await action({
      action: 'save',
      id: 'js',
      path: file.path,
      revision: saved.body.file.revision,
      content: 'throw new Error("deliberate startup failure");'
    });
    expect(failed.body.snapshot.status).toBe('failed');
    const repaired = await action({
      action: 'save',
      id: 'js',
      path: file.path,
      revision: failed.body.file.revision,
      content: file.content
    });
    expect(repaired.body.snapshot.status).toBe('ready');
    const disabled = await action({ action: 'disable', id: 'py' });
    expect(
      disabled.body.snapshot.sources.find((item: any) => item.id === 'py')
        .status
    ).toBe('disabled');
    expect(
      (await (await connect()).listTools()).tools.map((item) => item.name)
    ).toEqual(['js_greet']);
    const declaration = (
      await action({
        action: 'read',
        id: 'js',
        path: 'native/js/mcpack.json',
        generation: undefined
      })
    ).body.file;
    const manifest = JSON.parse(declaration.content);
    const nested = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        filter: {
          type: 'object',
          properties: { codes: { type: 'array', items: { type: 'integer' } } },
          required: ['codes'],
          additionalProperties: false
        }
      },
      required: ['name', 'filter'],
      additionalProperties: false
    };
    manifest.tools[0].inputSchema = nested;
    expect(
      (
        await action({
          action: 'save',
          id: 'js',
          path: declaration.path,
          revision: declaration.revision,
          content: JSON.stringify(manifest)
        })
      ).body.snapshot.status
    ).toBe('ready');
    const nestedClient = await connect();
    expect((await nestedClient.listTools()).tools[0].inputSchema).toEqual(
      nested
    );
    expect(
      (
        await nestedClient.callTool({
          name: 'js_greet',
          arguments: { name: 'Diego', filter: { codes: ['invalid'] } }
        })
      ).isError
    ).toBe(true);
    expect(
      (
        await nestedClient.callTool({
          name: 'js_greet',
          arguments: { name: 'Diego', filter: { codes: [1, 2] } }
        })
      ).isError
    ).not.toBe(true);
    expect(
      (
        await action({
          action: 'attach',
          id: 'duplicate',
          manifest: 'native/js/mcpack.json'
        })
      ).status
    ).toBe(200);
    expect(await (await fetch(base + '/project')).text()).toContain(
      'Duplicate tools'
    );
    await action({ action: 'remove', id: 'duplicate' });
    expect((await action({ action: 'remove', id: 'js' })).status).toBe(200);
    expect(
      (
        await action({
          action: 'attach',
          id: 'again',
          manifest: 'native/js/mcpack.json'
        })
      ).body.snapshot.status
    ).toBe('ready');
  } finally {
    for (const client of clients) await client.close().catch(() => {});
    const sources = await server.ssrLoadModule(
      '/src/lib/server/sources/manager.ts'
    );
    await sources.projectSources.close();
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
}, 120_000);
