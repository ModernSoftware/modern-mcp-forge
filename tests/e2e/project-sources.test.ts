import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import { installedMCPackCli } from '../../src/lib/server/mcpack/session';
import { getAvailablePort } from '../helpers/network';

test('project API owns sources across reload, switches, close and forget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-source-api-'));
  const oldDatabase = process.env.MCP_FORGE_DB_PATH;
  process.env.MCP_FORGE_DB_PATH = join(root, 'forge.db');
  const port = await getAvailablePort();
  const base = `http://127.0.0.1:${port}`;
  const server = await createServer({
    server: { host: '127.0.0.1', port, strictPort: true },
    logLevel: 'error'
  });
  const action = async (path: string, body: object, origin?: string) => {
    const response = await fetch(`${base}/api/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  try {
    await server.listen();
    const projectRoot = join(root, 'project');
    const created = await action('projects/create', { folderPath: projectRoot, name: 'Sources' });
    expect(created.status).toBe(201);
    const id = created.body.project.id;
    const file = join(projectRoot, 'forge.project.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    manifest.sources = [{ id: 'native', kind: 'native', manifest: 'native/mcpack.json' }];
    await cp(
      join(dirname(dirname(installedMCPackCli())), 'examples', 'hello'),
      join(projectRoot, 'native'),
      { recursive: true }
    );
    await writeFile(file, JSON.stringify(manifest));
    expect(
      (await action('project/sources', { action: 'reload', projectId: id }, 'https://evil.example'))
        .status
    ).toBe(403);
    expect((await action('project/sources', { action: 'reload', projectId: 'stale' })).status).toBe(
      409
    );
    const loaded = await action('project/sources', { action: 'reload', projectId: id });
    expect(loaded.status).toBe(200);
    expect(loaded.body.sources[0].status).toBe('ready');
    expect(loaded.body.sources[0].catalog.tools[0].name).toBe('greet');
    const authoring = await server.ssrLoadModule('/src/lib/server/project/manifest-service.ts');
    await authoring.addResourceToManifest({
      name: 'guide',
      uri: 'forge://guide',
      source: 'resources/guide.txt'
    });
    expect(JSON.parse(await readFile(file, 'utf8')).sources[0].id).toBe('native');
    await action('projects/create', { folderPath: join(root, 'other'), name: 'Other' });
    expect(
      ((await fetch(`${base}/api/project/sources`).then((r) => r.json())) as any).sources
    ).toEqual([]);
    await action('projects/activate', { projectId: id });
    expect(
      ((await fetch(`${base}/api/project/sources`).then((r) => r.json())) as any).sources[0].status
    ).toBe('ready');
    await action('mcpack', {
      action: 'open',
      manifestPath: join(projectRoot, 'native', 'mcpack.json')
    });
    const owner = await server.ssrLoadModule('/src/lib/server/sources/manager.ts');
    expect(owner.projectSources.snapshot().project).toBeNull();
    await action('projects/activate', { projectId: id });
    await action('projects/close', {});
    expect(owner.projectSources.snapshot().project).toBeNull();
    await action('projects/activate', { projectId: id });
    await action('projects/forget', { projectId: id });
    expect(owner.projectSources.snapshot().project).toBeNull();
    expect((await fetch(`${base}/mcp`)).status).toBe(503);
  } finally {
    const sources = await server.ssrLoadModule('/src/lib/server/sources/manager.ts');
    await sources.projectSources.close();
    const native = await server.ssrLoadModule('/src/lib/server/mcpack/session.ts');
    await native.nativeProjects.close();
    const database = await server.ssrLoadModule('/src/lib/server/database.ts');
    database.closeDatabase();
    await server.close();
    if (oldDatabase === undefined) delete process.env.MCP_FORGE_DB_PATH;
    else process.env.MCP_FORGE_DB_PATH = oldDatabase;
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 60_000);
