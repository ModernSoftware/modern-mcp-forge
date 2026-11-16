import { test, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import {
  cp,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  Client,
  StreamableHTTPClientTransport
} from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createServer } from 'vite';
import {
  getAvailablePort,
  waitForHttp
} from '../../../../tests/helpers/network';
import { scenarios } from './cases.mjs';

const lab = resolve(import.meta.dir, '..');
const repo = resolve(lab, '../../..');
const node = Bun.which('node');
const venvPython =
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const installed = new Set(['node_modules', '.venv']);
const ignored = new Set(['.xmcp', '__pycache__']);
const info = { name: 'lab-verifier', version: '1' };
const http = (url) => new StreamableHTTPClientTransport(new URL(url));
function stdio(command, args, cwd) {
  return new StdioClientTransport({ command, args, cwd, stderr: 'inherit' });
}
async function cloneProject(target) {
  const deps = [];
  await cp(lab, target, {
    recursive: true,
    filter(path) {
      if (installed.has(basename(path))) {
        deps.push(path);
        return false;
      }
      return !ignored.has(basename(path));
    }
  });
  for (const path of deps) {
    await symlink(path, join(target, path.slice(lab.length + 1)), 'junction');
  }
}

test('native workers and five framework applications agree with Forge over HTTP', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'forge multilanguage '));
  const project = join(temp, 'workbench');
  const oldDb = process.env.MCP_FORGE_DB_PATH;
  process.env.MCP_FORGE_DB_PATH = join(temp, 'registry.db');
  const port = await getAvailablePort();
  const base = 'http://127.0.0.1:' + port;
  const vite = await createServer({
    root: repo,
    server: { port, host: '127.0.0.1', strictPort: true },
    logLevel: 'error'
  });
  const clients = [];
  let api;
  async function connect(transport, options) {
    const client = new Client(info, options);
    clients.push(client);
    await client.connect(transport, { timeout: 20000 });
    return client;
  }
  async function post(path, data) {
    const response = await fetch(base + '/api/' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data)
    });
    expect(response.status).toBe(200);
    return response.json();
  }
  try {
    await cloneProject(project);
    await vite.listen();
    // Record the actual workflow process so the test can check downstream cleanup.
    const workflowFile = join(project, 'apps/fulfillment/server.mjs');
    await writeFile(
      workflowFile,
      "import { writeFileSync } from 'node:fs'; writeFileSync('workflow.pid', String(process.pid));\n" +
        (await readFile(workflowFile, 'utf8'))
    );
    const opened = await post('projects/open', { folderPath: project });
    let snapshot = await (await fetch(base + '/api/project/sources')).json();
    expect(snapshot.sources.map((s) => [s.id, s.status])).toEqual(
      [
        'order-desk',
        'returns',
        'policy',
        'deploy',
        'fulfillment',
        'warehouse'
      ].map((id) => [id, 'ready'])
    );
    const forge = await connect(http(base + '/mcp'));
    const defs = (await forge.listTools()).tools;
    expect(defs.map((t) => t.name).sort()).toEqual(
      [...new Set(scenarios.map(([, name]) => name))].sort()
    );

    // The REST application's ordinary HTTP endpoint and its projection run in the same process.
    const restPort = await getAvailablePort();
    const rest = 'http://127.0.0.1:' + restPort;
    const app = (id) => join(project, 'apps', id);
    const python = (id) => join(app(id), '.venv', venvPython);
    api = Bun.spawn(
      [
        python('returns'),
        '-m',
        'uvicorn',
        'application:app',
        '--host',
        '127.0.0.1',
        '--port',
        String(restPort),
        '--log-level',
        'warning'
      ],
      { cwd: app('returns'), stdout: 'ignore', stderr: 'inherit' }
    );
    await waitForHttp(rest + '/openapi.json', 20000);
    const direct = {
      native: await connect(
        stdio(
          node,
          [
            join(repo, 'node_modules/@modern-software/mcpack/dist/cli.js'),
            'serve',
            'mcpack.json'
          ],
          join(project, 'native')
        )
      ),
      returns: await connect(http(rest + '/mcp')),
      policy: await connect(
        stdio(python('policy'), ['application.py'], app('policy'))
      ),
      deploy: await connect(stdio(node, ['dist/stdio.js'], app('deploy'))),
      fulfillment: await connect(
        stdio(node, ['server.mjs'], app('fulfillment')),
        { versionNegotiation: { mode: { pin: '2026-07-28' } } }
      ),
      warehouse: await connect(stdio(node, ['server.mjs'], app('warehouse')))
    };
    for (const upstream of Object.values(direct)) {
      for (const tool of (await upstream.listTools()).tools) {
        expect(defs.find((t) => t.name === tool.name)?.inputSchema).toEqual(
          tool.inputSchema
        );
      }
    }
    for (const [source, name, args, expected, isError = false] of scenarios) {
      const request = { name, arguments: args };
      const reference = await direct[source].callTool(request);
      const result = await forge.callTool(request);
      expect(result.content, name).toEqual(reference.content);
      expect(result.structuredContent, name).toEqual(
        reference.structuredContent
      );
      expect(Boolean(result.isError), name).toBe(Boolean(reference.isError));
      expect(Boolean(result.isError), name).toBe(isError);
      if (typeof expected === 'string') {
        expect(JSON.stringify(result.content), name).toContain(expected);
      } else {
        expect(
          result.structuredContent ?? JSON.parse(result.content[0].text),
          name
        ).toMatchObject(expected);
      }
    }
    for (const client of [direct.fulfillment, forge]) {
      const request = {
        name: 'fulfill_order',
        arguments: { order: { id: 'CONCURRENT', sku: 'CABLE', units: 3 } }
      };
      const results = await Promise.all([
        client.callTool(request),
        client.callTool(request)
      ]);
      const outcomes = results.map((result) =>
        JSON.parse(result.content[0].text)
      );
      expect(outcomes.map((o) => o.replay).sort()).toEqual([false, true]);
      expect(
        outcomes.every((o) => o.status === 'shipped' && o.remaining === 9)
      ).toBe(true);
    }
    for (const [id, date, units, auth, status] of [
      ['A-100', '2026-10-20', 2, true, 200],
      ['B-200', '2026-10-20', 2, true, 403],
      ['A-100', '2026-12-10', 2, true, 409],
      ['A-100', '2026-10-20', 0, true, 422],
      ['A-100', '2026-10-20', 2, false, 401]
    ]) {
      const response = await fetch(rest + '/orders/' + id + '/returns', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(auth && { Authorization: 'Bearer demo-alice' })
        },
        body: JSON.stringify({
          as_of: date,
          item: { units, condition: 'opened' }
        })
      });
      expect(response.status).toBe(status);
      if (status === 200) expect((await response.json()).refund).toBe('30.59');
    }
    const resources = (await forge.listResources()).resources;
    const prompts = (await forge.listPrompts()).prompts;
    for (const [source, args] of [
      ['policy', { region: 'UY' }],
      ['warehouse', { sku: 'KIT' }]
    ]) {
      const upstream = direct[source];
      for (const { uri } of (await upstream.listResources()).resources) {
        const published =
          'forge-bridge://source/' + source + '/' + encodeURIComponent(uri);
        expect(resources.some((r) => r.uri === published)).toBe(true);
        const actual = await forge.readResource({ uri: published });
        const reference = await upstream.readResource({ uri });
        expect(actual.contents).toEqual(
          reference.contents.map((c) => ({ ...c, uri: published }))
        );
      }
      for (const prompt of (await upstream.listPrompts()).prompts) {
        expect(
          prompts.find((p) => p.name === prompt.name)?.arguments
        ).toMatchObject(prompt.arguments);
        const request = { name: prompt.name, arguments: args };
        expect((await forge.getPrompt(request)).messages).toEqual(
          (await upstream.getPrompt(request)).messages
        );
      }
    }
    // Modify only the temporary application. The compiler rediscovers the added file.
    await writeFile(
      join(app('deploy'), 'src/tools/quote.ts'),
      [
        'export const metadata = { name: "get_quote_by_sku", description: "Deployment cost" };',
        'export const schema = {};',
        'export default function quote() { return "deployment quote"; }'
      ].join('\n')
    );
    await writeFile(
      join(app('deploy'), 'src/tools/slow-check.ts'),
      [
        "import { writeFile } from 'node:fs/promises';",
        'export const schema = {};',
        'export default async function check() {',
        "  await writeFile('check-started.txt', 'started');",
        '  await new Promise(resolve => setTimeout(resolve, 3000));',
        "  return 'done';",
        '}'
      ].join('\n')
    );
    const xmcpBin = JSON.parse(
      await readFile(
        join(app('deploy'), 'node_modules/xmcp/package.json'),
        'utf8'
      )
    ).bin.xmcp;
    execFileSync(
      node,
      [join(app('deploy'), 'node_modules/xmcp', xmcpBin), 'build'],
      {
        cwd: app('deploy'),
        stdio: 'inherit',
        env: { ...process.env, XMCP_TELEMETRY_DISABLED: 'true' }
      }
    );
    // Simulate an unavailable warehouse application, independently of its adapter.
    await writeFile(
      join(app('warehouse'), 'application.mjs'),
      "throw new Error('fixture offline');"
    );
    snapshot = await post('project/sources', {
      action: 'reload',
      projectId: opened.project.id,
      generation: snapshot.generation
    });
    expect(snapshot.sources.find((s) => s.id === 'warehouse').status).toBe(
      'failed'
    );
    const names = (await forge.listTools()).tools.map((t) => t.name);
    expect(names).toContain('deploy__get_quote_by_sku');
    expect(names).not.toContain('allocate_stock');
    expect(
      (
        await forge.callTool({
          name: 'get_quote_by_sku',
          arguments: { sku: 'ACT-42', quantity: 1 }
        })
      ).structuredContent.sku
    ).toBe('ACT-42');
    expect(
      (
        await forge.callTool({
          name: 'deploy__get_quote_by_sku',
          arguments: {}
        })
      ).content[0].text
    ).toContain('deployment quote');
    const slow = (await forge.listTools()).tools.find((t) =>
      t.name.includes('slow')
    );
    expect(slow).toBeDefined();
    const controller = new AbortController();
    const cancelled = forge
      .callTool(
        { name: slow.name, arguments: {} },
        { signal: controller.signal }
      )
      .then(
        () => false,
        () => true
      );
    for (
      let i = 0;
      i < 100 &&
      !(await Bun.file(join(app('deploy'), 'check-started.txt')).exists());
      i++
    )
      await Bun.sleep(30);
    expect(
      await Bun.file(join(app('deploy'), 'check-started.txt')).exists()
    ).toBe(true);
    controller.abort();
    expect(await cancelled).toBe(true);
    expect(
      (await forge.listTools()).tools.some(
        (t) => t.name === 'estimate_delivery'
      )
    ).toBe(true);
    await post('projects/close', {});
    expect((await fetch(base + '/mcp')).status).toBe(503);
    const pid = Number(
      await readFile(join(app('fulfillment'), 'workflow.pid'), 'utf8')
    );
    const alive = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 80 && alive(); i++) await Bun.sleep(50);
    expect(alive()).toBe(false);
  } finally {
    await Promise.allSettled(clients.map((client) => client.close()));
    if (api) {
      api.kill();
      await api.exited;
    }
    await fetch(base + '/api/projects/close', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }).catch(() => {});
    await vite.close();
    if (oldDb === undefined) delete process.env.MCP_FORGE_DB_PATH;
    else process.env.MCP_FORGE_DB_PATH = oldDb;
    await rm(temp, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100
    });
  }
}, 180000);
