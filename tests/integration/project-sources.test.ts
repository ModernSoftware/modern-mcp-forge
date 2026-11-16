import { expect, test } from 'bun:test';
import { cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectSourceManager } from '../../src/lib/server/sources/manager';
import { ProjectSourcesSchema } from '../../src/lib/server/sources/schema';
import type { SourceAdapter } from '../../src/lib/server/sources/contracts';
import { installedMCPackCli } from '../../src/lib/server/mcpack/session';
import { ForgeProjectManifestSchema } from '../../src/lib/server/project/schema';
import { createManifest } from '../helpers/project';

const definition = (id: string) => ({
  id,
  kind: 'native' as const,
  enabled: true,
  manifest: `${id}/mcpack.json`
});
const empty = { tools: [], resources: [], prompts: [] };

test('sources preserve legacy manifests and reject ambiguous or unsafe descriptors', () => {
  expect(
    ForgeProjectManifestSchema.parse(createManifest()).sources
  ).toBeUndefined();
  expect(
    ProjectSourcesSchema.safeParse([definition('a'), definition('a')]).success
  ).toBe(false);
  for (const manifest of [
    '../mcpack.json',
    '/tmp/mcpack.json',
    'C:\\repo\\mcpack.json'
  ]) {
    expect(
      ProjectSourcesSchema.safeParse([{ ...definition('a'), manifest }]).success
    ).toBe(false);
  }
  expect(
    ProjectSourcesSchema.safeParse([
      {
        id: 'remote',
        kind: 'external',
        enabled: true,
        url: 'https://example.com/mcp'
      }
    ]).success
  ).toBe(true);
  expect(
    ProjectSourcesSchema.safeParse([
      {
        id: 'remote',
        kind: 'external',
        enabled: false,
        url: 'https://user:secret@example.com/mcp'
      }
    ]).success
  ).toBe(false);
});

test('partial startup rolls back all adapters, including the failing one', async () => {
  const closed: string[] = [];
  const manager = new ProjectSourceManager(
    (_root, source): SourceAdapter => ({
      async start() {
        if (source.id === 'broken') throw new Error('deliberate failure');
      },
      async discover() {
        return empty;
      },
      async invoke() {
        return source.id;
      },
      health() {
        return { status: 'ready' };
      },
      async close() {
        closed.push(source.id);
      }
    })
  );
  const failed = await manager.open('one', '.', [
    definition('good'),
    definition('broken')
  ]);
  expect(failed.error).toBe('Source broken: deliberate failure');
  expect(failed.sources.map((source) => source.status)).toEqual(['stopped', 'failed']);
  expect(failed.status).toBe('failed');
  expect(closed.sort()).toEqual(['broken', 'good']);
  expect(
    failed.sources.every((source) => source.catalog.tools.length === 0)
  ).toBe(true);
  expect((await manager.open('two', '.', [definition('good')])).status).toBe(
    'ready'
  );
  await manager.close();
});

test('startup overlaps three sources and settles pending starts before failure cleanup', async () => {
  const starting: string[] = [];
  const closed: string[] = [];
  const allStarting = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const manager = new ProjectSourceManager((_root, source) => ({
    async start() {
      starting.push(source.id);
      if (starting.length === 3) allStarting.resolve();
      if (source.id === 'broken') throw new Error('fixture failure');
      if (source.id === 'slow') await release.promise;
    },
    async discover() {
      return empty;
    },
    async invoke() {},
    health() {
      return { status: 'ready' as const };
    },
    async close() {
      closed.push(source.id);
    }
  }));
  const opened = manager.open(
    'project',
    '.',
    ['first', 'broken', 'slow', 'next'].map(definition)
  );
  try {
    await allStarting.promise;
    expect(starting).toEqual(['first', 'broken', 'slow']);
    expect(manager.startupProgress()).toMatchObject({
      project: 'project',
      status: 'starting',
      total: 4
    });
    expect(closed).toEqual([]);
  } finally {
    release.resolve();
  }
  const state = await opened;
  expect(state.error).toBe('Source broken: fixture failure');
  expect(starting).not.toContain('next');
  expect(closed.sort()).toEqual(['broken', 'first', 'slow']);
  expect(state.sources.map((s) => s.catalog)).toEqual([
    empty,
    empty,
    empty,
    empty
  ]);
});

test('close invalidates in-flight results and failed cleanup retains ownership for retry', async () => {
  let finish!: (result: unknown) => void;
  let failClose = true;
  let closeCount = 0;
  const controller = new AbortController();
  const manager = new ProjectSourceManager(() => ({
    async start() {},
    async discover() {
      return {
        ...empty,
        tools: [{ name: 'x', inputSchema: { type: 'object' } }]
      };
    },
    invoke(call) {
      expect(call.signal).toBe(controller.signal);
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    health() {
      return { status: 'ready' as const };
    },
    async close() {
      closeCount++;
      if (failClose) throw new Error('cleanup failed');
    }
  }));
  const opened = await manager.open('one', '.', [definition('a')]);
  const call = {
    kind: 'tool' as const,
    name: 'x',
    arguments: {},
    signal: controller.signal
  };
  const pending = manager.invoke('one', opened.generation, 'a', call);
  const outcome = pending.then(
    () => null,
    (error: Error) => error
  );
  await expect(manager.close()).rejects.toThrow('cleanup failed');
  const failed = manager.snapshot();
  await expect(
    manager.invoke('one', failed.generation, 'a', call)
  ).rejects.toThrow('not ready');
  finish('obsolete result');
  expect((await outcome)?.message).toContain('changed');
  failClose = false;
  await manager.close();
  expect(closeCount).toBe(2);
  expect(manager.snapshot().project).toBeNull();
});

test('a visibility edit republishes a fresh generation without restarting workers unless the pack changed', async () => {
  let starts = 0;
  let changed = false;
  const manager = new ProjectSourceManager(() => ({
    async start() {
      ++starts;
    },
    async discover() {
      return {
        ...empty,
        tools: [{ name: 'lookup', inputSchema: { type: 'object' } }]
      };
    },
    async invoke() {},
    async filesChanged() {
      return changed;
    },
    health() {
      return { status: 'ready' as const };
    },
    async close() {}
  }));
  const original = definition('native');
  const disabled = {
    ...original,
    disabledCapabilities: [{ kind: 'tools' as const, name: 'lookup' }]
  };
  try {
    const before = await manager.open('one', '.', [
      original,
      definition('other')
    ]);
    const after = await manager.open(
      'one',
      '.',
      [disabled, definition('other')],
      { visibilityOnly: 'native' }
    );
    expect(after.generation).toBeGreaterThan(before.generation);
    expect(after.sources[0].catalog.tools).toEqual([]);
    expect(after.sources[1].catalog.tools).toHaveLength(1);
    expect(starts).toBe(2);
    changed = true;
    await manager.open(
      'one',
      '.',
      [{ ...original, disabledCapabilities: [] }, definition('other')],
      { visibilityOnly: 'native' }
    );
    expect(starts).toBe(4);
  } finally {
    await manager.close();
  }
});

test('queued transitions complete in order and disabled sources never launch', async () => {
  const events: string[] = [];
  const manager = new ProjectSourceManager((_root, source) => ({
    async start() {
      events.push(`start ${source.id}`);
    },
    async discover() {
      return empty;
    },
    async invoke() {},
    health() {
      return { status: 'ready' as const };
    },
    async close() {
      events.push(`close ${source.id}`);
    }
  }));
  await Promise.all([
    manager.open('one', '.', [
      definition('a'),
      { ...definition('disabled'), enabled: false }
    ]),
    manager.open('two', '.', [definition('b')]),
    manager.close()
  ]);
  expect(events).toEqual(['start a', 'close a', 'start b', 'close b']);
  expect(manager.snapshot().status).toBe('stopped');
});

test('native sources isolate state and reject manifest symlinks outside the project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-sources-'));
  const outside = await mkdtemp(join(tmpdir(), 'forge-source-outside-'));
  const manager = new ProjectSourceManager();
  try {
    const example = join(
      dirname(dirname(installedMCPackCli())),
      'examples',
      'mixed'
    );
    for (const id of ['a', 'b'])
      await cp(example, join(root, id), { recursive: true });
    const opened = await manager.open('one', root, [
      definition('a'),
      definition('b')
    ]);
    expect(opened.error).toBeUndefined();
    expect(opened.sources.map((source) => source.status)).toEqual([
      'ready',
      'ready'
    ]);
    const call = {
      kind: 'tool' as const,
      name: 'summarize',
      arguments: { values: [1, 2] }
    };
    const invoke = (source: string) =>
      manager.invoke('one', opened.generation, source, call) as Promise<any>;
    const a = await invoke('a');
    expect((await invoke('a')).structuredContent.calls).toBe(2);
    const b = await invoke('b');
    expect(b.structuredContent.calls).toBe(1);
    expect(a.structuredContent.pid).not.toBe(b.structuredContent.pid);
    await manager.open('two', root, []);
    await expect(invoke('a')).rejects.toThrow('changed');
    await cp(example, outside, { recursive: true });
    await symlink(
      outside,
      join(root, 'escape'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    const rejected = await manager.open('three', root, [definition('escape')]);
    expect(rejected.error).toContain('inside the project');
  } finally {
    await manager.close();
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100
    });
    await rm(outside, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100
    });
  }
}, 30_000);

test('a freshly scaffolded source synchronizes a helper edited during worker startup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-first-sync-'));
  const manager = new ProjectSourceManager();
  try {
    await writeFile(join(root, 'value.mjs'), 'export default "initial";');
    await writeFile(
      join(root, 'handlers.mjs'),
      `
      import value from './value.mjs';
      import {writeFileSync} from 'node:fs';
      export function createWorker() {
        if (value === 'initial') writeFileSync(new URL('./value.mjs', import.meta.url), 'export default "ready";');
        return {tools: { inspect: async () => ({content: [{type:'text',text:value}]}) }};
      }`
    );
    await writeFile(
      join(root, 'mcpack.json'),
      JSON.stringify({
        schemaVersion: 1,
        name: 'scaffold',
        version: '1.0.0',
        workers: { main: { runtime: 'node', module: './handlers.mjs' } },
        tools: [
          {
            name: 'inspect',
            worker: 'main',
            handler: 'inspect',
            inputSchema: { type: 'object', properties: {} }
          }
        ]
      })
    );
    const snapshot = await manager.open(
      'project',
      root,
      [{ ...definition('new'), manifest: 'mcpack.json' }],
      { createdNative: 'new' }
    );
    expect(snapshot.status).toBe('ready');
    const result = await manager.testNative(
      'project',
      snapshot.generation,
      'new',
      { kind: 'tool', name: 'inspect', arguments: {} }
    );
    expect(result).toMatchObject({
      content: [{ type: 'text', text: 'ready' }]
    });
  } finally {
    await manager.close();
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100
    });
  }
}, 30000);
