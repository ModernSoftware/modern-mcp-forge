import { describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { NativeProjectManager, installedMCPackCli } from '../../src/lib/server/mcpack/session';
import { createNativeMcpServer } from '../../src/lib/server/mcpack/server';

const hasMCPack = existsSync(installedMCPackCli());
const source = `export function createWorker() {
  let count = 0;
  return {
    tools: { greet: async ({name}) => ({content: [{type: 'text', text: 'Hello ' + name}], structuredContent: {count: ++count, pid: process.pid}}) },
    resources: { guide: async ({uri}) => ({contents: [{uri, text: 'Native guide'}]}) },
    prompts: { welcome: async ({name}) => ({messages: [{role: 'user', content: {type:'text', text: 'Welcome ' + name}}]}) }
  };
}`;

// Required in the opt-in native integration command. The public CI can run
// without access to the private MCPack repository.
describe.skipIf(!hasMCPack)('native MCPack integration (installed package)', () => {
  test('persistent calls, protocol parity, source editing, restart, stale sessions and recovery', async () => {
    const root = await mkdtemp(join(tmpdir(), 'forge-native-'));
    const manifestPath = join(root, 'mcpack.json');
    const modulePath = join(root, 'handlers.mjs');
    const manager = new NativeProjectManager();
    let relayClient: Client | undefined;
    let relayServer: ReturnType<typeof createNativeMcpServer> | undefined;
    let standalone: Client | undefined;
    const manifest = {
      schemaVersion: 1,
      name: 'native-parity',
      version: '1',
      workers: { main: { runtime: 'node', module: './handlers.mjs' } },
      tools: [
        {
          name: 'greet',
          worker: 'main',
          handler: 'greet',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: false
          }
        }
      ],
      resources: [{ name: 'guide', uri: 'native://guide', worker: 'main', handler: 'guide' }],
      prompts: [
        {
          name: 'welcome',
          worker: 'main',
          handler: 'welcome',
          arguments: [{ name: 'name', required: true }]
        }
      ]
    };
    try {
      await writeFile(manifestPath, JSON.stringify(manifest));
      await writeFile(modulePath, source);
      const opened = await manager.open(manifestPath);
      expect(opened?.status).toBe('ready');
      const project = opened!.manifestPath;
      const first: any = await manager.invoke(project, 'tool', 'greet', { name: 'Diego' });
      const second: any = await manager.invoke(project, 'tool', 'greet', { name: 'Diego' });
      expect(second.structuredContent.count).toBe(2);
      expect(first.structuredContent.pid).toBe(second.structuredContent.pid);

      relayServer = createNativeMcpServer(manager);
      relayClient = new Client({ name: 'relay-test', version: '1' });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await relayServer.connect(serverTransport);
      await relayClient.connect(clientTransport);
      standalone = new Client({ name: 'standalone-test', version: '1' });
      await standalone.connect(
        new StdioClientTransport({
          command: Bun.which('node')!,
          args: [installedMCPackCli(), 'serve', manifestPath],
          stderr: 'ignore'
        })
      );
      expect(await relayClient.listTools()).toEqual(await standalone.listTools());
      expect(await relayClient.listResources()).toEqual(await standalone.listResources());
      expect(await relayClient.listPrompts()).toEqual(await standalone.listPrompts());
      expect(await relayClient.readResource({ uri: 'native://guide' })).toEqual(
        await standalone.readResource({ uri: 'native://guide' })
      );
      expect(
        await relayClient.getPrompt({ name: 'welcome', arguments: { name: 'Diego' } })
      ).toEqual(await standalone.getPrompt({ name: 'welcome', arguments: { name: 'Diego' } }));
      expect(
        (await relayClient.callTool({ name: 'greet', arguments: { name: 'Diego' } })).content
      ).toEqual(
        (await standalone.callTool({ name: 'greet', arguments: { name: 'Diego' } })).content
      );
      await expect(relayClient.callTool({ name: 'greet', arguments: {} })).rejects.toThrow();
      await standalone.close();
      standalone = undefined;

      const loaded = await manager.readSource(project, modulePath);
      await expect(manager.readSource(project, resolve('package.json'))).rejects.toThrow();
      await expect(manager.readSource(project, manifestPath + '.other')).rejects.toThrow();
      await writeFile(modulePath, source + '\n// external edit');
      await expect(
        manager.saveSource(project, modulePath, source, loaded.revision)
      ).rejects.toThrow('changed on disk');
      const fresh = await manager.readSource(project, modulePath);
      const saved = await manager.saveSource(
        project,
        modulePath,
        fresh.content.replace('Hello ', 'Hola '),
        fresh.revision
      );
      expect(saved.project?.status).toBe('ready');
      expect(await readFile(modulePath, 'utf8')).toContain('Hola ');
      await expect(
        relayClient.callTool({ name: 'greet', arguments: { name: 'Diego' } })
      ).rejects.toThrow('Reconnect');
      const after: any = await manager.invoke(project, 'tool', 'greet', { name: 'Diego' });
      expect(after.content[0].text).toBe('Hola Diego');
      expect(after.structuredContent.count).toBe(1);
      expect(after.structuredContent.pid).not.toBe(first.structuredContent.pid);

      const changed = await manager.readSource(project, modulePath);
      const broken = await manager.saveSource(
        project,
        modulePath,
        'not valid JavaScript !!',
        changed.revision
      );
      expect(broken.project?.status).toBe('failed');
      const repaired = await manager.saveSource(
        project,
        modulePath,
        source,
        broken.source.revision
      );
      expect(repaired.project?.status).toBe('ready');
      await manager.close();
      expect(manager.snapshot()).toBeNull();
    } finally {
      await relayClient?.close();
      await relayServer?.close();
      await standalone?.close();
      await manager.close();
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }, 30_000);
});

test('missing MCPack installation leaves the manifest editable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-native-missing-'));
  const manager = new NativeProjectManager(() => join(root, 'missing-cli.js'));
  try {
    const path = join(root, 'mcpack.json');
    await writeFile(
      path,
      JSON.stringify({ schemaVersion: 1, name: 'missing', version: '1', workers: {} })
    );
    const opened = await manager.open(path);
    expect(opened?.status).toBe('failed');
    expect(opened?.error).toContain('bun install --frozen-lockfile');
    expect((await manager.readSource(opened!.manifestPath, path)).content).toContain('missing');
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test.skipIf(!hasMCPack)(
  'native close waits for worker cleanup longer than the stock transport grace',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'forge-native-close-'));
    const manager = new NativeProjectManager();
    try {
      const path = join(root, 'mcpack.json');
      await writeFile(
        path,
        JSON.stringify({
          schemaVersion: 1,
          name: 'cleanup',
          version: '1',
          workers: {
            main: { runtime: 'node', module: './handler.mjs', shutdownTimeoutMs: 5000 }
          }
        })
      );
      await writeFile(
        join(root, 'handler.mjs'),
        `import { writeFile } from 'node:fs/promises';
export function createWorker() { return { async close() {
  await new Promise(resolve => setTimeout(resolve, 2500));
  await writeFile('closed.txt', 'done');
}}; }`
      );
      expect((await manager.open(path))?.status).toBe('ready');
      await manager.close();
      expect(await readFile(join(root, 'closed.txt'), 'utf8')).toBe('done');
    } finally {
      await manager.close();
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  },
  15_000
);
