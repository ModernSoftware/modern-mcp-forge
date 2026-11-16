import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, utimes } from 'node:fs/promises';
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
  const description = 'Reference material. '.repeat(30) + 'End of description.';
  const upstream = externalServer({
    token: 'external-fixture-token',
    description
  });
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
    const projectFile = join(root, 'project', 'forge.project.json');
    const before = await readFile(projectFile, 'utf8');
    const nativeGeneration = generation;
    const beforeClient = await connect();
    // A newly-created, untouched starter is immediately callable. A timestamp
    // update (sync client / IDE) must not turn identical bytes into a stale worker.
    const future = new Date(Date.now() + 5_000);
    await utimes(
      join(root, 'project/native/local/handlers.mjs'),
      future,
      future
    );
    const immediate = await post('project/native', {
      projectId,
      generation,
      action: 'invoke',
      id: 'local',
      kind: 'tool',
      name: 'local_lookup',
      arguments: {}
    });
    expect(immediate.status).toBe(200);
    expect(immediate.body.result.content[0].text).toContain('Not implemented');
    const denied = await action({
      action: 'create',
      source: { ...source, bearerTokenEnv: undefined }
    });
    expect(denied.status).toBe(400);
    expect(denied.body.error).toContain('HTTP 401');
    expect(denied.body.error).not.toContain('external-fixture-token');
    expect(await readFile(projectFile, 'utf8')).toBe(before);
    expect(
      (await (await fetch(base + '/api/project/sources')).json()).generation
    ).toBe(nativeGeneration);
    expect(
      (await beforeClient.callTool({ name: 'local_lookup', arguments: {} }))
        .content?.[0]
    ).toMatchObject({ type: 'text' });
    const preview = await action({
      action: 'preview',
      operation: 'create',
      source
    });
    expect(preview.status).toBe(200);
    expect(await readFile(projectFile, 'utf8')).toBe(before);
    const handshakes = upstream.calls.filter(
      (c) => c.method === 'initialize'
    ).length;
    expect(
      (await action({ action: 'commit', ticket: preview.body.ticket })).body
        .snapshot.status
    ).toBe('ready');
    expect(
      upstream.calls.filter((c) => c.method === 'initialize')
    ).toHaveLength(handshakes);
    expect(
      (await action({ action: 'commit', ticket: preview.body.ticket })).status
    ).toBe(409);
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
    expect(workspace).toContain('Show more');
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
    expect(resource.description).toBe(description);
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
    const goodConfig = await readFile(projectFile, 'utf8');
    const rejectedUpdate = await action({
      action: 'update',
      source: { ...source, bearerTokenEnv: 'MISSING_FORGE_EXTERNAL_E2E_TOKEN' }
    });
    expect(rejectedUpdate.status).toBe(400);
    expect(await readFile(projectFile, 'utf8')).toBe(goodConfig);
    expect(
      (
        await client.callTool({
          name: 'remote__lookup',
          arguments: { filter: { id: 'STILL-LIVE' } }
        })
      ).content?.[0]
    ).toMatchObject({ text: 'Order STILL-LIVE' });
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
    // A saved (including pre-upgrade) remote can later become unavailable.
    // It remains repairable while the native tool stays exposed.
    delete process.env.FORGE_EXTERNAL_E2E_TOKEN;
    const reloaded = await post('project/sources', {
      projectId,
      generation,
      action: 'reload'
    });
    generation = reloaded.body.generation;
    expect(reloaded.status).toBe(200);
    expect(
      reloaded.body.sources.find((s: { id: string }) => s.id === 'remote')
    ).toMatchObject({
      status: 'failed',
      catalog: { tools: [], resources: [], prompts: [] }
    });
    const degraded = await connect();
    expect((await degraded.listTools()).tools.map((t) => t.name)).toEqual([
      'local_lookup'
    ]);
    expect(
      (await degraded.callTool({ name: 'local_lookup', arguments: {} }))
        .content?.[0]
    ).toMatchObject({ type: 'text' });
    expect((await fetch(base + '/project/external/remote')).status).toBe(200);
    const html = await (await fetch(base + '/workspace')).text();
    expect(html).toContain('Manage connection');
    process.env.FORGE_EXTERNAL_E2E_TOKEN = 'external-fixture-token';
    const recovered = await post('project/sources', {
      projectId,
      generation,
      action: 'reload'
    });
    generation = recovered.body.generation;
    expect(
      (await (await connect()).listTools()).tools.map((t) => t.name).sort()
    ).toEqual(['local_lookup', 'remote__lookup']);
    // Keep old connections qualified until their owner opts in. A policy change
    // must be reflected by both public discovery and real upstream dispatch.
    const flexible = { ...source, naming: 'collisions' };
    expect((await action({ action: 'update', source: flexible })).status).toBe(
      200
    );
    const bare = await connect();
    expect((await bare.listTools()).tools.map((t) => t.name).sort()).toEqual([
      'local_lookup',
      'lookup'
    ]);
    expect(
      (
        await bare.callTool({
          name: 'lookup',
          arguments: { filter: { id: 'BARE' } }
        })
      ).content?.[0]
    ).toMatchObject({ text: 'Order BARE' });
    expect((await bare.listPrompts()).prompts[0].name).toBe('review');
    expect((await bare.listResources()).resources[0]).toMatchObject({
      name: 'invoice',
      uri: resource.uri
    });
    expect(
      (await action({ action: 'create', source: { ...flexible, id: 'other' } }))
        .status
    ).toBe(200);
    const paired = await connect();
    expect((await paired.listTools()).tools.map((t) => t.name).sort()).toEqual([
      'local_lookup',
      'other__lookup',
      'remote__lookup'
    ]);
    expect(
      (
        await paired.callTool({
          name: 'other__lookup',
          arguments: { filter: { id: 'QUALIFIED' } }
        })
      ).content?.[0]
    ).toMatchObject({ text: 'Order QUALIFIED' });
    expect(
      (
        await paired.getPrompt({
          name: 'remote__review',
          arguments: { customer: 'Alias' }
        })
      ).messages[0].content
    ).toMatchObject({ text: 'Review Alias' });
    expect(
      (await paired.readResource({ uri: resource.uri })).contents[0]
    ).toMatchObject({ uri: resource.uri });
    expect(
      (
        await action({
          action: 'invoke',
          id: 'remote',
          kind: 'tool',
          name: 'lookup',
          arguments: {}
        })
      ).status
    ).toBe(400);
    const history = await vite.ssrLoadModule(
      '/src/lib/server/workbench/executions.ts'
    );
    const records = history.listExecutions(100);
    const matching = (id: string) =>
      records
        .map((row: { id: number }) => history.getExecution(row.id))
        .filter(
          (row: { argumentsJson: string }) =>
            JSON.parse(row.argumentsJson)?.filter?.id === id
        );
    expect(matching('QUALIFIED')).toHaveLength(1);
    expect(matching('QUALIFIED')[0]).toMatchObject({
      toolName: 'other__lookup',
      origin: 'mcp',
      sourceId: 'other',
      status: 'succeeded'
    });
    expect(matching('UI')[0]).toMatchObject({
      origin: 'workbench',
      sourceId: 'remote',
      status: 'succeeded'
    });
    for (const origin of ['mcp', 'workbench']) {
      expect(
        records.some(
          (row: { toolName: string; origin: string; status: string }) =>
            row.toolName === 'local_lookup' &&
            row.origin === origin &&
            row.status === 'failed'
        )
      ).toBe(true);
    }
    expect(
      records.some(
        (row: { toolName: string }) =>
          row.toolName.includes('invoice') || row.toolName.includes('review')
      )
    ).toBe(false);
    await action({ action: 'remove', id: 'other' });
    expect(
      (await (await connect()).listTools()).tools.map((t) => t.name).sort()
    ).toEqual(['local_lookup', 'lookup']);
    const collidingNative = await post('project/native', {
      action: 'create-capability',
      projectId,
      generation,
      id: 'secondNative',
      kind: 'tools',
      runtime: 'node',
      name: 'lookup',
      description: 'Local lookup'
    });
    expect(collidingNative.body.snapshot.status).toBe('ready');
    const withNative = await connect();
    expect(
      (await withNative.listTools()).tools.map((t) => t.name).sort()
    ).toEqual(['local_lookup', 'lookup', 'remote__lookup']);
    expect(
      (await withNative.callTool({ name: 'lookup', arguments: {} })).isError
    ).toBe(true);
    expect(
      (
        await withNative.callTool({
          name: 'remote__lookup',
          arguments: { filter: { id: 'NATIVE-COLLISION' } }
        })
      ).content?.[0]
    ).toMatchObject({ text: 'Order NATIVE-COLLISION' });
    const setRule = (rule: object) =>
      action({ action: 'exposure', id: 'remote', rule });
    const sessionCount = () =>
      upstream.calls.filter((c) => c.method === 'initialize').length;
    const countBeforeRules = sessionCount();
    const args = { filter: { id: 'CASE-42' } };
    const cases = (body: object) =>
      post('project/cases', { projectId, generation, ...body });
    let revision = (await cases({ action: 'list' })).body.revision;
    const definition = {
      name: 'Known order',
      source: 'remote',
      sourceKind: 'external',
      tool: 'lookup',
      arguments: args,
      expect: {
        mode: 'success',
        fields: [{ path: '/content/0/text', value: 'Order CASE-42' }]
      }
    };
    const saved = await cases({ action: 'save', revision, definition });
    expect(saved.status).toBe(200);
    const caseId = saved.body.cases[0].id;
    expect(
      (
        await cases({
          action: 'save',
          revision,
          definition: { ...definition, name: 'Stale edit' }
        })
      ).status
    ).toBe(409);
    revision = saved.body.revision;
    expect(
      (
        await setRule({
          kind: 'tools',
          identity: 'lookup',
          alias: 'local_lookup'
        })
      ).status
    ).toBe(400);
    expect(
      (
        await setRule({
          kind: 'tools',
          identity: 'lookup',
          alias: 'find_order',
          description: 'Local order lookup'
        })
      ).status
    ).toBe(200);
    const renamed = await connect();
    expect(
      (await renamed.listTools()).tools.find((t) => t.name === 'find_order')
    ).toMatchObject({
      description: 'Local order lookup',
      inputSchema: tools.find((t) => t.name === 'remote__lookup')!.inputSchema
    });
    expect(
      (await renamed.callTool({ name: 'find_order', arguments: args }))
        .content?.[0]
    ).toMatchObject({ text: 'Order CASE-42' });
    expect(
      (
        await setRule({
          kind: 'resources',
          identity: 'support://invoice',
          alias: 'order_invoice'
        })
      ).status
    ).toBe(200);
    expect(
      (
        await setRule({
          kind: 'prompts',
          identity: 'review',
          alias: 'review_order'
        })
      ).status
    ).toBe(200);
    const remapped = await connect();
    expect((await remapped.listResources()).resources[0]).toMatchObject({
      name: 'order_invoice',
      uri: resource.uri
    });
    expect(
      (await remapped.readResource({ uri: resource.uri })).contents[0]
    ).toMatchObject({ text: 'Invoice contents' });
    expect(
      (
        await remapped.getPrompt({
          name: 'review_order',
          arguments: { customer: 'Diego' }
        })
      ).messages[0].content
    ).toMatchObject({ text: 'Review Diego' });
    for (const rule of [
      { kind: 'tools', identity: 'lookup', hidden: true },
      { kind: 'resources', identity: 'support://invoice', hidden: true },
      { kind: 'prompts', identity: 'review', hidden: true }
    ])
      expect((await setRule(rule)).status).toBe(200);
    expect(sessionCount()).toBe(countBeforeRules);
    const hidden = await connect();
    expect((await hidden.listTools()).tools.map((t) => t.name)).not.toContain(
      'find_order'
    );
    expect((await hidden.listResources()).resources).toHaveLength(0);
    expect((await hidden.listPrompts()).prompts).toHaveLength(0);
    const dispatched = () =>
      upstream.calls.filter((c) =>
        ['tools/call', 'resources/read', 'prompts/get'].includes(c.method)
      ).length;
    const callsBefore = dispatched();
    for (const call of [
      () => hidden.callTool({ name: 'find_order', arguments: args }),
      () => renamed.callTool({ name: 'find_order', arguments: args }),
      () => hidden.readResource({ uri: resource.uri }),
      () =>
        hidden.getPrompt({ name: 'review', arguments: { customer: 'test' } })
    ])
      await call().then(
        (r) => expect(r).toMatchObject({ isError: true }),
        () => {}
      );
    expect(dispatched()).toBe(callsBefore);
    expect(
      (await cases({ action: 'run', revision, id: caseId, confirmLive: false }))
        .status
    ).toBe(400);
    expect(dispatched()).toBe(callsBefore);
    expect(
      (await cases({ action: 'run', revision, id: caseId, confirmLive: true }))
        .body
    ).toEqual({ passed: true, problems: [] });
    expect(dispatched()).toBe(callsBefore + 1);
    const negative = await cases({
      action: 'save',
      revision,
      definition: {
        ...definition,
        name: 'Missing filter',
        arguments: {},
        expect: { mode: 'invalid-input', path: '/filter' }
      }
    });
    const invalid = negative.body.cases.find(
      (c: { name: string }) => c.name === 'Missing filter'
    );
    expect(
      (
        await cases({
          action: 'run',
          revision: negative.body.revision,
          id: invalid.id,
          confirmLive: false
        })
      ).body.passed
    ).toBe(true);
    expect(dispatched()).toBe(callsBefore + 1);
    const business = await cases({
      action: 'save',
      revision: negative.body.revision,
      definition: {
        name: 'Starter error',
        source: 'local',
        sourceKind: 'native',
        tool: 'local_lookup',
        arguments: {},
        expect: {
          mode: 'tool-error',
          fields: [{ path: '/isError', value: true }]
        }
      }
    });
    const businessId = business.body.cases.find(
      (c: { name: string }) => c.name === 'Starter error'
    ).id;
    expect(
      (
        await cases({
          action: 'run',
          revision: business.body.revision,
          id: businessId,
          confirmLive: true
        })
      ).body.passed
    ).toBe(true);
    const mismatch = await cases({
      action: 'save',
      revision: business.body.revision,
      definition: {
        ...definition,
        name: 'Different order',
        expect: {
          mode: 'success',
          fields: [{ path: '/content/0/text', value: 'Other' }]
        }
      }
    });
    const mismatchId = mismatch.body.cases.find(
      (c: { name: string }) => c.name === 'Different order'
    ).id;
    expect(
      (
        await cases({
          action: 'run',
          revision: mismatch.body.revision,
          id: mismatchId,
          confirmLive: true
        })
      ).body
    ).toEqual({
      passed: false,
      problems: [
        { path: '/content/0/text', expected: 'Other', actual: 'Order CASE-42' }
      ]
    });
    const reloadedCases = await post('project/sources', {
      projectId,
      generation,
      action: 'reload'
    });
    generation = reloadedCases.body.generation;
    expect((await cases({ action: 'list' })).body.cases[0]).toMatchObject({
      id: caseId,
      issue: '',
      lastRun: { passed: true }
    });
    expect((await (await connect()).listResources()).resources).toHaveLength(0);
    await post('projects/close', {});
    const reopen = await post('projects/open', {
      folderPath: join(root, 'project')
    });
    expect(reopen.body.project.id).toBe(projectId);
    generation = (await (await fetch(base + '/api/project/sources')).json())
      .generation;
    expect((await cases({ action: 'list' })).body.cases[0]).toMatchObject({
      id: caseId,
      issue: '',
      lastRun: { passed: true }
    });
    expect(
      (
        await cases({
          action: 'run',
          revision: mismatch.body.revision,
          id: caseId,
          confirmLive: true
        })
      ).body.passed
    ).toBe(true);
    const dataOnDisk = await readFile(
      join(root, 'project', 'forge.cases.json'),
      'utf8'
    );
    expect(dataOnDisk).not.toContain('lastRun');
    expect(dataOnDisk).not.toContain('external-fixture-token');
    await action({ action: 'remove', id: 'remote' });
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
