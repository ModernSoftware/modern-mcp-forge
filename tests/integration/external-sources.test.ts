import { expect, test } from 'bun:test';
import {
  ExternalSourceAdapter,
  externalName,
  externalUri
} from '../../src/lib/server/sources/external';
import { externalServer } from '../helpers/external-server';

const definition = (url: string, bearerTokenEnv?: string) => ({
  id: 'support',
  kind: 'external' as const,
  enabled: true,
  url,
  ...(bearerTokenEnv ? { bearerTokenEnv } : {})
});

test('external discovery and calls retain upstream identity and namespace public results', async () => {
  const upstream = externalServer({ token: 'test-bearer' });
  const old = process.env.FORGE_TEST_EXTERNAL_TOKEN;
  process.env.FORGE_TEST_EXTERNAL_TOKEN = 'test-bearer';
  const adapter = new ExternalSourceAdapter(
    definition(upstream.url, 'FORGE_TEST_EXTERNAL_TOKEN')
  );
  try {
    await adapter.start();
    const catalog = await adapter.discover();
    expect(catalog.tools[0].name).toBe('support__lookup');
    expect(catalog.tools[0].inputSchema.properties).toHaveProperty('filter');
    expect(catalog.tools[0].annotations?.readOnlyHint).toBe(true);
    expect(catalog.resources[0].uri).toBe(
      externalUri('support', 'support://invoice')
    );
    const tool = (await adapter.invoke({
      kind: 'tool',
      name: 'support__lookup',
      arguments: { filter: { id: '42' } }
    })) as any;
    expect(tool.content[0].text).toBe('Order 42');
    expect(tool.content[1].uri).toBe(
      externalUri('support', 'support://invoice')
    );
    const resource = (await adapter.invoke({
      kind: 'resource',
      name: catalog.resources[0].uri,
      arguments: {}
    })) as any;
    expect(resource.contents[0].uri).toBe(catalog.resources[0].uri);
    const prompt = (await adapter.invoke({
      kind: 'prompt',
      name: 'support__review',
      arguments: { customer: 'Diego' }
    })) as any;
    expect(prompt.messages[0].content.text).toBe('Review Diego');
    expect(
      upstream.calls.find((call) => call.method === 'tools/call')?.name
    ).toBe('lookup');
    expect(
      upstream.calls.every(
        (call) => call.authorization === 'Bearer test-bearer'
      )
    ).toBe(true);
    await adapter.close();
    await expect(
      adapter.invoke({ kind: 'tool', name: 'support__lookup', arguments: {} })
    ).rejects.toThrow('not ready');
  } finally {
    await adapter.close();
    upstream.close();
    if (old === undefined) delete process.env.FORGE_TEST_EXTERNAL_TOKEN;
    else process.env.FORGE_TEST_EXTERNAL_TOKEN = old;
  }
}, 30_000);

test('external discovery paginates, tolerates absent capabilities, and bounds repeated cursors', async () => {
  for (const repeatedCursor of [false, true]) {
    const upstream = externalServer({
      paginated: true,
      repeatedCursor,
      toolsOnly: true
    });
    const adapter = new ExternalSourceAdapter(definition(upstream.url));
    try {
      if (repeatedCursor)
        await expect(adapter.start()).rejects.toThrow(
          'could not connect or discover'
        );
      else {
        await adapter.start();
        const catalog = await adapter.discover();
        expect(catalog.tools.map((tool) => tool.name)).toEqual([
          'support__first',
          'support__second'
        ]);
        expect(catalog.resources).toEqual([]);
        expect(catalog.prompts).toEqual([]);
      }
    } finally {
      await adapter.close();
      upstream.close();
    }
  }
}, 30_000);

test('external authentication errors are redacted; redirects cannot leak credentials', async () => {
  const upstream = externalServer({ token: 'SECRET-FROM-UPSTREAM-ERROR' });
  const adapter = new ExternalSourceAdapter(definition(upstream.url));
  try {
    await expect(adapter.start()).rejects.toThrow('Check URL, authentication');
    expect(adapter.health().status).toBe('failed');
  } finally {
    await adapter.close();
    upstream.close();
  }
  let received = 0;
  const target = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      received++;
      return new Response('unexpected');
    }
  });
  const redirect = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      return Response.redirect(`http://127.0.0.1:${target.port}/mcp`, 307);
    }
  });
  const redirected = new ExternalSourceAdapter(
    definition(`http://127.0.0.1:${redirect.port}/mcp`)
  );
  try {
    await expect(redirected.start()).rejects.toThrow('could not connect');
    expect(received).toBe(0);
  } finally {
    await redirected.close();
    redirect.stop(true);
    target.stop(true);
  }
});

test('external namespace is bounded, stable and distinguishes unusual names and case-sensitive source IDs', () => {
  expect(externalName('a', 'x'.repeat(100)).length).toBeLessThanOrEqual(64);
  expect(externalName('a', 'one two')).not.toBe(externalName('a', 'one_two'));
  expect(externalUri('A', 'support://x')).not.toBe(
    externalUri('a', 'support://x')
  );
});
