import { createHash } from 'node:crypto';
import type { SourceCatalog } from './contracts';
import type { ExposureRule } from './schema';
import { qualifiedName } from './upstream';

export type ReservedCatalog = {
  [K in keyof SourceCatalog]: ReadonlyArray<{
    name: string;
    enabled?: boolean;
  }>;
};

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface Entry {
  id: string;
  flexible: boolean;
  rules?: ExposureRule[];
  identity?: (kind: keyof SourceCatalog, route: string) => string;
  catalog: SourceCatalog;
}

/** Names are allocated for one complete generation, separately for each MCP kind. */
export function publishCatalogs(entries: Entry[], legacy?: ReservedCatalog) {
  const published = new Map(
    entries.map(({ id, catalog }) => [
      id,
      {
        id,
        status: 'ready' as const,
        catalog,
        tools: new Map<string, string>(),
        prompts: new Map<string, string>()
      }
    ])
  );
  for (const kind of ['tools', 'resources', 'prompts'] as const) {
    const taken = new Set(
      legacy?.[kind].filter((x) => x.enabled !== false).map((x) => x.name)
    );
    const flexible: {
      id: string;
      item: { name: string; uri?: string };
      original: string;
    }[] = [];
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const rules = new Map(
        entry.rules?.filter((r) => r.kind === kind).map((r) => [r.identity, r])
      );
      const catalog = published.get(entry.id)!.catalog;
      // Each entry owns a fresh catalog for this publication.
      const visible = catalog[kind].filter((item) => {
        const route = 'uri' in item ? item.uri : item.name;
        return !rules.get(entry.identity?.(kind, route) ?? route)?.hidden;
      });
      Object.assign(catalog, { [kind]: visible });
      for (const item of visible) {
        const route = 'uri' in item ? item.uri : item.name;
        const rule = rules.get(entry.identity?.(kind, route) ?? route);
        if (rule?.description !== undefined)
          item.description = rule.description;
        if (rule?.alias) {
          if (kind !== 'resources')
            published.get(entry.id)![kind].set(rule.alias, item.name);
          item.name = rule.alias;
        }
        if (rule?.alias || !entry.flexible) {
          taken.add(item.name);
          continue;
        }
        flexible.push({ id: entry.id, item, original: item.name });
        counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
      }
    }
    // Reserve all usable unqualified names before choosing any fallback. If two
    // connections want the same bare name, both qualify it, regardless of order.
    const qualify = flexible.filter(({ original }) => {
      if (
        taken.has(original) ||
        counts.get(original)! > 1 ||
        (kind === 'tools' && !/^[A-Za-z0-9_.-]{1,64}$/.test(original))
      )
        return true;
      taken.add(original);
      return false;
    });
    qualify.sort(
      (a, b) =>
        compare(a.id, b.id) ||
        compare(a.original, b.original) ||
        compare(a.item.uri ?? '', b.item.uri ?? '')
    );
    for (const { id, item, original } of qualify) {
      const prefix = qualifiedName(id, original);
      let name = prefix;
      for (let n = 0; taken.has(name); n++) {
        const suffix = createHash('sha256')
          .update(JSON.stringify([id, original, n]))
          .digest('hex')
          .slice(0, 12);
        name = prefix.slice(0, 51) + '_' + suffix;
      }
      taken.add(name);
      item.name = name;
      if (kind !== 'resources') published.get(id)![kind].set(name, original);
    }
  }
  return published;
}
