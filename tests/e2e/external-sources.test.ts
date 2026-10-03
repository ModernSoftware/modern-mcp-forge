import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import {
  Client,
  StreamableHTTPClientTransport
} from '@modelcontextprotocol/client';
import { externalServer } from '../helpers/external-server';
import { getAvailablePort } from '../helpers/network';

test('Forge combines authenticated external and native sources over HTTP and closes them with the project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-external-e2e-'));
  const previousDatabase = process.env.MCP_FORGE_DB_PATH;
  const previousToken = process.env.FORGE_EXTERNAL_E2E_TOKEN;
  process.env.MCP_FORGE_DB_PATH = join(root, 'forge.db');
  process.env.FORGE_EXTERNAL_E2E_TOKEN = 'external-fixture-token';
  const upstream = externalServer({ token: 'external-fixture-token' });
  const port = await getAvailablePort();
  const base = `http://127.0.0.1:${port}`;
  const vite = await createServer({
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
    const result = (await response.json()) as any;
    if (result.snapshot) generation = result.snapshot.generation;
    return { status: response.status, body: result };
  }
  async function action(body: object, origin?: string) {
    return post('project/external', { projectId, generation, ...body }, origin);
  }
  async function connect() {
    const client = new Client({ name: 'external-e2e', version: '1' });
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + '/mcp'))
    );
    return client;
  }
  try {
    await vite.listen();
    const created = await post('projects/create', {
      name: 'External demo',
      folderPath: join(root, 'project')
    });
    projectId = created.body.project.id;
    generation = (
      (await (await fetch(base + '/api/project/sources')).json()) as any
    ).generation;
    const native = await post('project/native', {
      action: 'create-capability',
      projectId,
      generation,
      id: 'local',
      runtime: 'node',
      kind: 'tools',
      name: 'local_lookup',
      description: 'Native capability'
    });
    expect(native.body.snapshot.status).toBe('ready');
    const source = {
      id: 'remote',
      kind: 'external',
      enabled: true,
      url: upstream.url,
      bearerTokenEnv: 'FORGE_EXTERNAL_E2E_TOKEN'
    };
    expect(
      (await action({ action: 'create', source }, 'https://evil.example'))
        .status
    ).toBe(403);
    expect(
      (await action({ action: 'create', source, projectId: 'stale' })).status
    ).toBe(409);
    expect(
      (await action({ action: 'create', source })).body.snapshot.status
    ).toBe('ready');
    expect(
      await readFile(join(root, 'project', 'forge.project.json'), 'utf8')
    ).not.toContain('external-fixture-token');
    for (const path of [
      '/workspace',
      '/workspace/connect',
      '/project/external/remote',
      '/project'
    ])
      expect((await fetch(base + path)).status).toBe(200);
    const workspace = await (await fetch(base + '/workspace')).text();
    expect(workspace).toContain('remote__lookup');
    expect(workspace).toContain('External');
    const client = await connect();
    const tools = (await client.listTools()).tools;
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'local_lookup',
      'remote__lookup'
    ]);
    expect(
      tools.find((tool) => tool.name === 'remote__lookup')?.annotations
        ?.readOnlyHint
    ).toBe(true);
    const call = await client.callTool({
      name: 'remote__lookup',
      arguments: { filter: { id: 'ORDER-42' } }
    });
    expect(call.content?.[0]).toMatchObject({ text: 'Order ORDER-42' });
    const resource = (await client.listResources()).resources[0];
    expect(resource.uri).toStartWith('forge-external://source/remote/');
    expect(
      (await client.readResource({ uri: resource.uri })).contents[0]
    ).toMatchObject({ uri: resource.uri, text: 'Invoice contents' });
    expect(
      (
        await client.getPrompt({
          name: 'remote__review',
          arguments: { customer: 'Diego' }
        })
      ).messages[0].content
    ).toMatchObject({ text: 'Review Diego' });
    expect(
      (
        await client.callTool({
          name: 'remote__lookup',
          arguments: { filter: { id: 42 } }
        })
      ).isError
    ).toBe(true);
    const oldGeneration = generation;
    await action({ action: 'disable', id: 'remote' });
    expect(
      (await (await connect()).listTools()).tools.map((tool) => tool.name)
    ).toEqual(['local_lookup']);
    expect(
      (
        await action({
          action: 'invoke',
          id: 'remote',
          kind: 'tool',
          name: 'remote__lookup',
          arguments: {},
          generation: oldGeneration
        })
      ).status
    ).toBe(409);
    await action({ action: 'enable', id: 'remote' });
    expect(
      (
        await action({
          action: 'invoke',
          id: 'remote',
          kind: 'tool',
          name: 'remote__lookup',
          arguments: { filter: { id: 'UI' } }
        })
      ).body.result.content[0].text
    ).toBe('Order UI');
    await action({ action: 'remove', id: 'remote' });
    expect(
      (
        await action({
          action: 'create',
          source: {
            ...source,
            bearerTokenEnv: 'MISSING_FORGE_EXTERNAL_E2E_TOKEN'
          }
        })
      ).body.snapshot.status
    ).toBe('failed');
    expect((await fetch(base + '/project/external/remote')).status).toBe(200);
    await action({ action: 'disable', id: 'remote' });
    expect(
      (await (await connect()).listTools()).tools.map((tool) => tool.name)
    ).toEqual(['local_lookup']);
    await post('projects/close', {});
    expect((await fetch(base + '/mcp')).status).toBe(503);
  } finally {
    for (const client of clients) await client.close().catch(() => {});
    const sources = await vite.ssrLoadModule(
      '/src/lib/server/sources/manager.ts'
    );
    await sources.projectSources.close();
    const db = await vite.ssrLoadModule('/src/lib/server/database.ts');
    db.closeDatabase();
    await vite.close();
    upstream.close();
    if (previousDatabase === undefined) delete process.env.MCP_FORGE_DB_PATH;
    else process.env.MCP_FORGE_DB_PATH = previousDatabase;
    if (previousToken === undefined)
      delete process.env.FORGE_EXTERNAL_E2E_TOKEN;
    else process.env.FORGE_EXTERNAL_E2E_TOKEN = previousToken;
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100
    });
  }
}, 120_000);
