import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join, resolve } from 'node:path';
import {
  Client,
  StreamableHTTPClientTransport
} from '@modelcontextprotocol/client';
import { createServer } from 'vite';
import { externalServer } from '../helpers/external-server';
import { getAvailablePort } from '../helpers/network';

test('Node and Python bridges attach, serve the mixed catalog and stop with the project', async () => {
  const pythonCommand = Bun.which('python') ?? Bun.which('python3');
  if (!pythonCommand)
    throw new Error(
      'Python 3 is required for the bridge E2E test. See docs/testing.md.'
    );
  const checkPython = (executable: string) => {
    try {
      execFileSync(
        executable,
        [
          '-c',
          [
            'from mcp import types',
            'from mcp.server import Server',
            'from mcp.server.stdio import stdio_server',
            'from mcp.server.fastmcp import FastMCP'
          ].join('; ')
        ],
        {
          encoding: 'utf8',
          timeout: 30_000,
          windowsHide: true,
          stdio: 'pipe'
        }
      );
    } catch (error) {
      throw new Error(
        `Python bridge E2E prerequisite failed for ${executable}. ` +
          `Install the fixture SDK in the Python environment used by this test: ` +
          `"${pythonCommand}" -m pip install "mcp==1.29.0". ` +
          'The temporary bridge virtual environment inherits system site packages, not packages from an activated parent virtual environment. See docs/testing.md.',
        { cause: error }
      );
    }
  };
  checkPython(pythonCommand);
  const root = await mkdtemp(join(tmpdir(), 'forge bridges '));
  const folder = join(root, 'mixed project');
  const checkout = join(root, 'developer checkout');
  const checkoutEnv = 'FORGE_TEST_SHIPPING_CHECKOUT';
  const originalCheckout = process.env[checkoutEnv];
  process.env[checkoutEnv] = checkout;
  const originalDb = process.env.MCP_FORGE_DB_PATH;
  const originalSecret = process.env.FORGE_BRIDGE_TEST_SECRET;
  process.env.MCP_FORGE_DB_PATH = join(root, 'registry.db');
  process.env.FORGE_BRIDGE_TEST_SECRET = 'local-test-value';
  const upstream = externalServer({ toolsOnly: true });
  const port = await getAvailablePort();
  const base = `http://127.0.0.1:${port}`;
  const vite = await createServer({
    server: { host: '127.0.0.1', port, strictPort: true },
    logLevel: 'error'
  });
  const client = new Client({ name: 'bridge-acceptance', version: '1' });
  let projectId = '';
  let generation = 0;
  async function post(path: string, body: object) {
    const response = await fetch(base + '/api/' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const value = (await response.json()) as any;
    if (value.snapshot) generation = value.snapshot.generation;
    return { status: response.status, value };
  }
  const bridge = (body: object) =>
    post('project/bridge', { projectId, generation, ...body });
  const manifest = () => readFile(join(folder, 'forge.project.json'), 'utf8');
  try {
    await vite.listen();
    const created = await post('projects/create', {
      name: 'Bridges',
      folderPath: folder
    });
    projectId = created.value.project.id;
    generation = (
      (await (await fetch(base + '/api/project/sources')).json()) as any
    ).generation;
    expect(
      (
        await post('project/native', {
          projectId,
          generation,
          action: 'create-capability',
          id: 'local',
          runtime: 'node',
          kind: 'tools',
          name: 'stock',
          description: 'Native stock'
        })
      ).status
    ).toBe(200);
    expect(
      (
        await post('project/external', {
          projectId,
          generation,
          action: 'create',
          source: { id: 'remote', kind: 'external', url: upstream.url }
        })
      ).status
    ).toBe(200);
    const before = await manifest();
    await mkdir(join(folder, 'bridges/inventory'), { recursive: true });
    await copyFile(
      resolve('examples/bridges/direct-stdio/server.mjs'),
      join(folder, 'bridges/inventory/server.mjs')
    );
    await mkdir(checkout);
    const application = await readFile(
      resolve('examples/bridges/direct-stdio/server.py'),
      'utf8'
    );
    await writeFile(join(checkout, 'server.py'), application);
    const generated = await bridge({
      action: 'scaffold',
      runtime: 'python',
      id: 'shipping'
    });
    expect(generated.status).toBe(200);
    expect(generated.value.entrypoint).toBe('bridges/shipping/adapter.py');
    expect(
      (await bridge({ action: 'scaffold', runtime: 'python', id: 'shipping' }))
        .status
    ).toBe(409);
    const node = {
      kind: 'bridge',
      id: 'inventory',
      runtime: 'node',
      entrypoint: 'bridges/inventory/server.mjs',
      enabled: true
    };
    const python = {
      kind: 'bridge',
      id: 'shipping',
      runtime: 'python',
      ...generated.value,
      checkoutEnv,
      enabled: true
    };
    const nodeDir = dirname(join(folder, node.entrypoint));
    const pyDir = dirname(join(folder, python.entrypoint));
    // Use the installed SDK dependencies. Each existing server lives in a real project folder.
    await symlink(
      resolve('node_modules'),
      join(nodeDir, 'node_modules'),
      'junction'
    );
    execFileSync(pythonCommand, [
      '-m',
      'venv',
      '--system-site-packages',
      '--without-pip',
      join(pyDir, '.venv')
    ]);
    checkPython(
      join(
        pyDir,
        '.venv',
        process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
      )
    );
    const nodeFile = join(folder, node.entrypoint);
    const starter = await readFile(nodeFile, 'utf8');
    await writeFile(
      nodeFile,
      `import {writeFileSync} from 'node:fs';\nwriteFileSync('launch.json',JSON.stringify({pid:process.pid,arg:process.argv[2],forwarded:process.env.FORGE_BRIDGE_TEST_SECRET}));\n` +
        starter
    );
    expect(
      (
        await bridge({
          action: 'create',
          source: { ...node, entrypoint: '../oops.mjs' }
        })
      ).status
    ).toBe(400);
    expect(
      (
        await bridge({
          action: 'create',
          source: { ...node, inheritEnv: ['FORGE_BRIDGE_MISSING_TEST_ENV'] }
        })
      ).value.error
    ).toContain('FORGE_BRIDGE_MISSING_TEST_ENV');
    await symlink(root, join(folder, 'outside'), 'junction');
    await writeFile(
      join(root, 'outside.mjs'),
      "throw new Error('Should not launch')"
    );
    expect(
      (
        await bridge({
          action: 'create',
          source: { ...node, entrypoint: 'outside/outside.mjs' }
        })
      ).value.error
    ).toContain('outside');
    expect(await manifest()).toBe(before);
    const preview = await bridge({
      action: 'preview',
      operation: 'create',
      source: { ...node, args: ['two words'] }
    });
    expect(preview.status).toBe(200);
    expect(await manifest()).toBe(before);
    expect(
      (
        await post('project/external', {
          action: 'commit',
          projectId,
          generation,
          ticket: preview.value.ticket
        })
      ).status
    ).toBe(409);
    expect(
      (await bridge({ action: 'commit', ticket: preview.value.ticket })).status
    ).toBe(200);
    expect(
      JSON.parse(await readFile(join(nodeDir, 'launch.json'), 'utf8'))
    ).toMatchObject({ arg: 'two words' });
    expect(
      JSON.parse(await readFile(join(nodeDir, 'launch.json'), 'utf8')).forwarded
    ).toBeUndefined();
    const saved = await manifest();
    expect(
      (
        await bridge({
          action: 'update',
          source: { ...node, entrypoint: 'bridges/missing.mjs' }
        })
      ).status
    ).toBe(400);
    expect(await manifest()).toBe(saved);
    const stale = generation;
    const unwired = await bridge({
      action: 'preview',
      operation: 'create',
      source: python
    });
    expect(unwired.value.error).toBeUndefined();
    expect(await manifest()).toBe(saved);
    const empty = await bridge({
      action: 'create',
      source: { ...python, id: 'unwired' }
    });
    expect(empty.status).toBe(200);
    const emptyWorkspace = await (await fetch(base + '/workspace')).text();
    expect(emptyWorkspace).toContain('href="/project/bridge/unwired"');
    expect(emptyWorkspace).toContain('This source has an empty catalog.');
    expect((await bridge({ action: 'remove', id: 'unwired' })).status).toBe(
      200
    );
    await copyFile(
      resolve('examples/bridges/adapters/fastmcp_adapter.py'),
      join(folder, python.entrypoint)
    );
    const attached = await bridge({ action: 'create', source: python });
    expect(attached.value.error).toBeUndefined();
    expect(attached.status).toBe(200);
    expect(
      (await bridge({ generation: stale, action: 'remove', id: 'shipping' }))
        .status
    ).toBe(409);
    const promptRequest = {
      action: 'invoke',
      id: 'shipping',
      kind: 'prompt',
      name: 'review_shipping'
    };
    expect(
      (await bridge({ ...promptRequest, arguments: {} })).value.error
    ).toBe('Prompt review_shipping requires the region argument.');
    expect(
      (await bridge({ ...promptRequest, arguments: { region: 4 } })).value.error
    ).toBe('Prompt arguments must be strings.');
    expect(
      (await bridge({ ...promptRequest, arguments: { region: 'local' } })).value
        .result.messages[0].content.text
    ).toBe('Review shipping for local');
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + '/mcp'))
    );
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain('stock');
    expect(names).toContain('inventory__stock');
    expect(names).toContain('shipping_days');
    expect(names).toContain('remote__lookup');
    expect(
      (
        await client.callTool({
          name: 'inventory__stock',
          arguments: { sku: 'DEMO' }
        })
      ).content?.[0]
    ).toMatchObject({ text: '12' });
    expect(
      (
        await client.callTool({
          name: 'shipping_days',
          arguments: { region: 'local' }
        })
      ).content?.[0]
    ).toMatchObject({ text: '2' });
    const resources = (await client.listResources()).resources;
    for (const [id, scheme] of [
      ['inventory', 'inventory'],
      ['shipping', 'shipping']
    ]) {
      const res = resources.find((item) =>
        item.uri.startsWith(`forge-bridge://source/${id}/`)
      );
      expect(res?.name).toBe(id + '__guide');
      expect(decodeURIComponent(res!.uri)).toContain(scheme + '://guide');
      expect(
        (await client.readResource({ uri: res!.uri })).contents[0].uri
      ).toBe(res!.uri);
    }
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
    expect(prompts).toContain('review_stock');
    expect(prompts).toContain('review_shipping');
    expect(
      (
        await client.getPrompt({
          name: 'review_stock',
          arguments: { sku: 'DEMO' }
        })
      ).messages[0].content
    ).toMatchObject({ text: 'Review stock for DEMO' });
    expect(
      (
        await client.getPrompt({
          name: 'review_shipping',
          arguments: { region: 'local' }
        })
      ).messages[0].content
    ).toMatchObject({ text: 'Review shipping for local' });
    expect(
      (
        await bridge({
          action: 'invoke',
          id: 'shipping',
          kind: 'tool',
          name: 'shipping_days',
          arguments: { region: 'other' }
        })
      ).value.result.content[0].text
    ).toBe('5');
    expect(await (await fetch(base + '/workspace')).text()).toContain(
      'inventory__stock'
    );
    expect(
      await (await fetch(base + '/project/bridge/shipping')).text()
    ).toContain('Test a bridged capability');
    const pyFile = join(folder, python.entrypoint);
    const healthyPy = await readFile(pyFile, 'utf8');
    await writeFile(pyFile, 'import missing_bridge_dependency_for_test\n');
    const broken = await post('project/sources', {
      action: 'reload',
      projectId,
      generation
    });
    expect(broken.status).toBe(200);
    expect(
      broken.value.sources.find((s: { id: string }) => s.id === 'shipping')
        .error
    ).toContain('dependencies');
    generation = broken.value.generation;
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain(
      'shipping_days'
    );
    expect(
      (
        await client.callTool({
          name: 'inventory__stock',
          arguments: { sku: 'DEMO' }
        })
      ).content?.[0]
    ).toMatchObject({ text: '12' });
    await writeFile(pyFile, healthyPy);
    const updated = await bridge({
      action: 'update',
      source: { ...node, inheritEnv: ['FORGE_BRIDGE_TEST_SECRET'] }
    });
    expect(updated.status).toBe(200);
    expect((await client.listTools()).tools.map((t) => t.name)).toContain(
      'shipping_days'
    );
    const launched = JSON.parse(
      await readFile(join(nodeDir, 'launch.json'), 'utf8')
    );
    expect(launched.forwarded).toBe('local-test-value');
    expect(await manifest()).not.toContain('local-test-value');
    expect(await manifest()).not.toContain(checkout);
    expect(await readFile(join(checkout, 'server.py'), 'utf8')).toBe(
      application
    );
    process.kill(launched.pid, 'SIGKILL');
    const deadline = Date.now() + 5000;
    while (
      (await client.listTools()).tools.some(
        (t) => t.name === 'inventory__stock'
      ) &&
      Date.now() < deadline
    )
      await sleep(25);
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain(
      'inventory__stock'
    );
    expect(
      (
        await client.callTool({
          name: 'shipping_days',
          arguments: { region: 'local' }
        })
      ).content?.[0]
    ).toMatchObject({ text: '2' });
    const repaired = await post('project/sources', {
      action: 'reload',
      projectId,
      generation
    });
    expect(repaired.status).toBe(200);
    const restarted = JSON.parse(
      await readFile(join(nodeDir, 'launch.json'), 'utf8')
    );
    expect(
      (
        await client.callTool({
          name: 'inventory__stock',
          arguments: { sku: 'DEMO' }
        })
      ).content?.[0]
    ).toMatchObject({ text: '12' });
    expect((await post('projects/close', {})).status).toBe(200);
    expect((await fetch(base + '/mcp')).status).toBe(503);
    expect(() => process.kill(restarted.pid, 0)).toThrow();
  } finally {
    await client.close();
    const sources = await vite.ssrLoadModule(
      '/src/lib/server/sources/manager.ts'
    );
    await sources.projectSources.close();
    (await vite.ssrLoadModule('/src/lib/server/database.ts')).closeDatabase();
    await vite.close();
    upstream.close();
    if (originalCheckout === undefined) delete process.env[checkoutEnv];
    else process.env[checkoutEnv] = originalCheckout;
    if (originalDb === undefined) delete process.env.MCP_FORGE_DB_PATH;
    else process.env.MCP_FORGE_DB_PATH = originalDb;
    if (originalSecret === undefined)
      delete process.env.FORGE_BRIDGE_TEST_SECRET;
    else process.env.FORGE_BRIDGE_TEST_SECRET = originalSecret;
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100
    });
  }
}, 120000);
