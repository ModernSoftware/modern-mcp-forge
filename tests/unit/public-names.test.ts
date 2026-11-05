import { expect, test } from 'bun:test';
import { publishCatalogs } from '../../src/lib/server/sources/public-names';

test('reserves native, legacy and explicit names before allocating remote aliases, independent of discovery order', () => {
  const entry = (id: string, flexible: boolean, names: string[]) => ({
    id,
    flexible,
    catalog: {
      tools: names.map((name) => ({
        name,
        inputSchema: { type: 'object' as const }
      })),
      resources: [],
      prompts: []
    }
  });
  const legacy = {
    tools: [
      { name: 'echo', enabled: true },
      { name: 'free', enabled: false }
    ],
    resources: [],
    prompts: []
  };
  function names(reverse: boolean) {
    const sources = [
      entry('local', false, ['a__echo']),
      entry('a', true, ['echo', 'free', 'shared']),
      entry('b', true, ['shared']),
      entry('fixed', false, ['fixed__shared'])
    ];
    const result = publishCatalogs(
      reverse ? sources.reverse() : sources,
      legacy
    );
    const a = result.get('a')!;
    return a.catalog.tools.map((t) => ({
      name: t.name,
      target: a.tools.get(t.name) ?? t.name
    }));
  }
  const aliases = names(false);
  expect(aliases).toEqual(names(true));
  expect(aliases[0].name).toMatch(/^a__echo_[0-9a-f]{12}$/);
  expect(aliases.map((x) => x.target)).toEqual(['echo', 'free', 'shared']);
  expect(aliases.slice(1).map((x) => x.name)).toEqual(['free', 'a__shared']);
});
