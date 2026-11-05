import { expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createBridgeStarter } from '../../src/lib/server/sources/bridge-starter';
import { BridgeSourceAdapter } from '../../src/lib/server/sources/bridge';
import type { ProjectSource } from '../../src/lib/server/sources/schema';

test('a versioned Node adapter delegates to two checkouts without redefining their capabilities', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge adapter '));
  const project = join(root, 'forge repo');
  const clone = join(root, 'second forge repo');
  const checkoutEnv = 'FORGE_TEST_APP_ROOT';
  const previous = process.env[checkoutEnv];
  const owners: BridgeSourceAdapter[] = [];
  try {
    await mkdir(project);
    const generated = createBridgeStarter(
      {
        id: 'project',
        name: 'Demo',
        path: project,
        createdAt: '',
        lastOpenedAt: '',
        available: true
      },
      'registry',
      'node'
    );
    const descriptor = {
      id: 'registry',
      kind: 'bridge',
      runtime: 'node',
      enabled: true,
      checkoutEnv,
      ...generated
    } satisfies Extract<ProjectSource, { kind: 'bridge' }>;
    const config = JSON.stringify({ sources: [descriptor] });
    await writeFile(join(project, 'forge.project.json'), config);
    const open = async (folder: string) => {
      const saved = JSON.parse(
        await readFile(join(folder, 'forge.project.json'), 'utf8')
      );
      const owner = new BridgeSourceAdapter(folder, saved.sources[0]);
      owners.push(owner);
      await owner.start();
      return owner;
    };
    delete process.env[checkoutEnv];
    await expect(open(project)).rejects.toThrow(checkoutEnv);
    process.env[checkoutEnv] = project;
    const unwired = await open(project);
    expect(await unwired.discover()).toEqual({
      tools: [],
      resources: [],
      prompts: []
    });
    await unwired.close();
    await writeFile(
      join(project, generated.entrypoint),
      'export default {listTools() {return []}};'
    );
    await expect(open(project)).rejects.toThrow('pair');
    const adapter = await readFile(
      resolve('examples/bridges/adapters/registry.mjs'),
      'utf8'
    );
    await writeFile(join(project, generated.entrypoint), adapter);
    await cp(project, clone, { recursive: true });
    const application = await readFile(
      resolve('examples/bridges/registry/application.mjs'),
      'utf8'
    );
    for (const [index, folder] of [project, clone].entries()) {
      const checkout = join(root, 'application ' + index);
      await mkdir(checkout);
      const implementation =
        application +
        (index ? "\nactions.set('new_quote', actions.get('quote'));\n" : '');
      await writeFile(join(checkout, 'application.mjs'), implementation);
      process.env[checkoutEnv] = checkout;
      const owner = await open(folder);
      const catalog = await owner.discover();
      expect(catalog.tools.map((t) => t.name)).toEqual(
        index ? ['quote', 'new_quote'] : ['quote']
      );
      expect(
        await owner.invoke({
          kind: 'tool',
          name: index ? 'new_quote' : 'quote',
          arguments: { quantity: 2 }
        })
      ).toMatchObject({ content: [{ text: '{"total":24}' }] });
      expect(
        await owner.invoke({
          kind: 'tool',
          name: 'quote',
          arguments: { quantity: 0 }
        })
      ).toMatchObject({
        isError: true,
        content: [{ text: '{"error":"QUANTITY_MUST_BE_POSITIVE"}' }]
      });
      expect(
        await owner.invoke({
          kind: 'resource',
          name: catalog.resources[0].uri,
          arguments: {}
        })
      ).toMatchObject({ contents: [{ text: 'Quotes use USD.' }] });
      expect(
        await owner.invoke({
          kind: 'prompt',
          name: 'review',
          arguments: { sku: 'ABC' }
        })
      ).toMatchObject({ messages: [{ content: { text: 'Review ABC' } }] });
      expect(await readFile(join(checkout, 'application.mjs'), 'utf8')).toBe(
        implementation
      );
      expect(await readFile(join(folder, generated.entrypoint), 'utf8')).toBe(
        adapter
      );
      expect(await readFile(join(folder, 'forge.project.json'), 'utf8')).toBe(
        config
      );
      await owner.close();
    }
  } finally {
    await Promise.all(owners.map((o) => o.close()));
    if (previous === undefined) delete process.env[checkoutEnv];
    else process.env[checkoutEnv] = previous;
    await rm(root, { recursive: true, force: true });
  }
}, 20000);
