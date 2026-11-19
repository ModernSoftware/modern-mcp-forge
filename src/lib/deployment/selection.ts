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
      imports?: string[];
      warnings?: string[];
      errors?: string[];
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
  const warnings = new Set<string>();
  const errors = new Set<string>();
  for (const worker of preview.workers) {
    if (!workers.has(worker.id)) continue;
    required.add(worker.module);
    for (const path of worker.assets) required.add(path);
    for (const path of worker.imports ?? []) required.add(path);
    for (const warning of worker.warnings ?? []) warnings.add(warning);
    for (const error of worker.errors ?? []) errors.add(error);
    for (const name of worker.environment) environment.add(name);
  }
  return {
    workers,
    required,
    environment: [...environment].sort(),
    warnings: [...warnings].sort(),
    errors: [...errors].sort()
  };
}
