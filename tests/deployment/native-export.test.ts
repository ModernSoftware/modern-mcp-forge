import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import {
  Client,
  StreamableHTTPClientTransport
} from '@modelcontextprotocol/client';
import { nativeStarter } from '../../src/lib/server/sources/starter';
import { previewExport } from '../../src/lib/server/deployment/native-export';
import { ForgeProjectManifestSchema } from '../../src/lib/server/project/schema';
import { getAvailablePort, waitForHttp } from '../helpers/network';

function npm(cwd: string, ...args: string[]) {
  if (process.platform === 'win32')
    execFileSync('cmd.exe', ['/d', '/c', 'npm', ...args], {
      cwd,
      stdio: 'inherit'
    });
  else execFileSync('npm', args, { cwd, stdio: 'inherit' });
}

test('download a mixed-project native export, clean-install it and call both workers without Forge', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge deployed pack '));
  const project = join(dir, 'workspace');
  const target = join(dir, 'standalone');
  const lab = resolve('examples/bridges/compatibility-lab');
  const previous = process.env.MCP_FORGE_DB_PATH;
  process.env.MCP_FORGE_DB_PATH = join(dir, 'forge.db');
  const port = await getAvailablePort();
  const base = 'http://127.0.0.1:' + port;
  const vite = await createServer({
    server: { port, host: '127.0.0.1', strictPort: true },
    logLevel: 'error'
  });
  let forgeClosed = false;
  let host: ReturnType<typeof Bun.spawn> | undefined;
  const client = new Client({ name: 'deployment-check', version: '1' });
  const post = (path: string, body: unknown) =>
    fetch(base + '/api/' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  async function closeForge() {
    await post('projects/close', {});
    (await vite.ssrLoadModule('/src/lib/server/database.ts')).closeDatabase();
    await vite.close();
    forgeClosed = true;
  }
  try {
    await mkdir(project);
    await mkdir(target);
    await cp(join(lab, 'native'), join(project, 'native'), {
      recursive: true,
      filter: (p) => basename(p) !== 'node_modules'
    });
    const handbook = nativeStarter('manual', 'python');
    const packPath = join(project, 'native', 'mcpack.json');
    const pack = JSON.parse(await readFile(packPath, 'utf8'));
    pack.tools.push({ ...pack.tools[0], name: 'internal_quote' });
    pack.workers.manual = handbook.manifest.workers.main;
    pack.resources = handbook.manifest.resources.map((item) => ({
      ...item,
      worker: 'manual'
    }));
    pack.prompts = handbook.manifest.prompts.map((item) => ({
      ...item,
      worker: 'manual'
    }));
    await writeFile(join(project, 'native', handbook.module), handbook.code);
    await writeFile(packPath, JSON.stringify(pack));
    const manifest = ForgeProjectManifestSchema.parse(
      JSON.parse(await readFile(join(lab, 'forge.project.json'), 'utf8'))
    );
    for (const source of manifest.sources ?? [])
      if (source.kind !== 'native') source.enabled = false;
    manifest.sources!.push({
      id: 'dev-only',
      kind: 'external',
      enabled: false,
      url: 'https://dev.example.org/mcp',
      bearerTokenEnv: 'DEV_TOKEN'
    });
    await writeFile(
      join(project, 'forge.project.json'),
      JSON.stringify(manifest)
    );
    await vite.listen();
    expect((await post('projects/open', { folderPath: project })).status).toBe(
      200
    );
    const page = await fetch(base + '/workspace/export');
    expect(await page.text()).toContain('Download .tar.gz');
    const preview = await previewExport(project, manifest, 'order-desk');
    const input = {
      projectId: manifest.project.id,
      id: 'order-desk',
      revision: preview.revision,
      capabilities: [
        'tools/get_quote_by_sku',
        'tools/estimate_delivery',
        'resources/manual_guide',
        'prompts/manual_welcome'
      ],
      files: []
    };
    const deliveryOnly = await post('project/export', {
      ...input,
      capabilities: ['tools/estimate_delivery']
    });
    expect(deliveryOnly.status).toBe(200);
    const deliveryFiles = await new Bun.Archive(
      await deliveryOnly.blob()
    ).files();
    expect([...deliveryFiles.keys()].sort()).toEqual([
      'README.md',
      'pack/mcpack.json',
      'pack/package-lock.json',
      'pack/package.json',
      'pack/shipping.py',
      'package-lock.json',
      'package.json'
    ]);
    const deliveryManifest = JSON.parse(
      await deliveryFiles.get('pack/mcpack.json')!.text()
    );
    expect(Object.keys(deliveryManifest.workers)).toEqual(['shipping']);
    expect(
      deliveryManifest.tools.map((item: { name: string }) => item.name)
    ).toEqual(['estimate_delivery']);
    expect(
      (await post('project/export', { ...input, projectId: 'different' }))
        .status
    ).toBe(409);
    expect(
      (
        await fetch(base + '/api/project/export', {
          method: 'POST',
          headers: { origin: 'https://untrusted.example' }
        })
      ).status
    ).toBe(403);
    const response = await post('project/export', input);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain(
      'order-desk-native.tar.gz'
    );
    await new Bun.Archive(await response.blob()).extract(target);
    // A local Forge dependency can become a dangling npm link and still allow
    // MCPack to start. Assert portability in the archive itself as well.
    const hostPackage = JSON.parse(
      await readFile(join(target, 'package.json'), 'utf8')
    );
    const hostLock = JSON.parse(
      await readFile(join(target, 'package-lock.json'), 'utf8')
    );
    expect(Object.keys(hostPackage.dependencies)).toEqual([
      '@modern-software/mcpack'
    ]);
    expect(hostLock.packages[''].dependencies).toEqual(hostPackage.dependencies);
    for (const [path, entry] of Object.entries(hostLock.packages) as [
      string,
      { link?: boolean; resolved?: string }
    ][]) {
      expect(path === '' || path.startsWith('node_modules/')).toBe(true);
      expect(entry.link).not.toBe(true);
      if (entry.resolved) expect(entry.resolved).toMatch(/^https:\/\//);
    }
    await closeForge();
    // Removing the entire original workspace catches absolute paths or dependencies on Forge's source tree.
    await rm(project, { recursive: true, force: true });
    npm(target, 'ci', '--no-audit', '--no-fund');
    npm(join(target, 'pack'), 'ci', '--no-audit', '--no-fund');
    npm(target, 'run', 'validate');
    const deploymentPort = await getAvailablePort();
    const deployed = 'http://127.0.0.1:' + deploymentPort;
    const token = randomUUID();
    host = Bun.spawn(
      [
        Bun.which('node')!,
        join(target, 'node_modules/@modern-software/mcpack/dist/cli.js'),
        'serve',
        'pack/mcpack.json',
        '--transport',
        'http',
        '--port',
        String(deploymentPort),
        '--token-env',
        'DEPLOY_TOKEN'
      ],
      {
        cwd: target,
        env: { ...process.env, DEPLOY_TOKEN: token },
        stderr: 'inherit',
        stdout: 'ignore'
      }
    );
    await waitForHttp(deployed + '/readyz');
    expect((await fetch(deployed + '/mcp', { method: 'POST' })).status).toBe(
      401
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(deployed + '/mcp'), {
        requestInit: { headers: { Authorization: 'Bearer ' + token } }
      })
    );
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual([
      'estimate_delivery',
      'get_quote_by_sku'
    ]);
    const quote = await client.callTool({
      name: 'get_quote_by_sku',
      arguments: { sku: 'ACT-42', quantity: 3, tier: 'premium' }
    });
    expect(quote.structuredContent).toMatchObject({ total: '59.93' });
    const delivery = await client.callTool({
      name: 'estimate_delivery',
      arguments: {
        orderedAtLocal: '2026-10-30T16:00',
        service: 'express',
        parcels: [{ kg: 2 }]
      }
    });
    expect(delivery.structuredContent).toMatchObject({
      deliveryDate: '2026-11-04'
    });
    expect((await client.listResources()).resources.map((r) => r.uri)).toEqual([
      'mcpack://manual/guide'
    ]);
    expect(
      (await client.readResource({ uri: 'mcpack://manual/guide' })).contents[0]
    ).toMatchObject({ text: 'Your native MCPack guide.' });
    expect(
      (
        await client.getPrompt({
          name: 'manual_welcome',
          arguments: { name: 'Diego' }
        })
      ).messages[0].content
    ).toMatchObject({ text: 'Welcome Diego' });
  } finally {
    await client.close().catch(() => {});
    if (host) {
      host.kill();
      await host.exited;
    }
    if (!forgeClosed) await closeForge();
    if (previous === undefined) delete process.env.MCP_FORGE_DB_PATH;
    else process.env.MCP_FORGE_DB_PATH = previous;
    await rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100
    });
  }
}, 180000);
