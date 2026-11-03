export const capabilityKinds = ['tools', 'resources', 'prompts'] as const;

type Capability = {
  kind: (typeof capabilityKinds)[number];
  name: string;
  worker: string;
};

export function capabilityKey(item: Capability) {
  return item.kind + '/' + item.name;
}

/** Used by both the review screen and the archive writer. */
export function exportContents(
  preview: {
    capabilities: Capability[];
    workers: {
      id: string;
      module: string;
      assets: string[];
      environment: string[];
    }[];
    files: { path: string; dependency: boolean }[];
  },
  selection: string[]
) {
  const keys = new Set(selection);
  const workers = new Set(
    preview.capabilities
      .filter((c) => keys.has(capabilityKey(c)))
      .map((c) => c.worker)
  );
  const required = new Set(
    preview.files.filter((f) => f.dependency).map((f) => f.path)
  );
  const environment = new Set<string>();
  for (const worker of preview.workers) {
    if (!workers.has(worker.id)) continue;
    required.add(worker.module);
    for (const path of worker.assets) required.add(path);
    for (const name of worker.environment) environment.add(name);
  }
  return { workers, required, environment: [...environment].sort() };
}
