import type { ForgeProjectManifest } from '../project/schema';
import { projectSources, type ProjectSourceManager } from './manager';

/** Preserve source names; reject ambiguous routing until explicit aliases exist. */
export function projectCatalog(
  manifest: ForgeProjectManifest,
  manager: ProjectSourceManager = projectSources
) {
  const snapshot = manager.snapshot();
  const enabled = (manifest.sources ?? []).filter((source) => source.enabled);
  if (
    enabled.length &&
    (snapshot.project !== manifest.project.id || snapshot.status !== 'ready')
  ) {
    throw new Error(
      snapshot.error ??
        'Project sources are not ready. Reload them from Project.'
    );
  }
  if (snapshot.project === manifest.project.id) {
    const configured = manifest.sources ?? [];
    const same =
      configured.length === snapshot.sources.length &&
      configured.every((definition, index) => {
        const running = snapshot.sources[index];
        return Object.entries(definition).every(
          ([key, value]) =>
            JSON.stringify(
              (running as unknown as Record<string, unknown>)[key]
            ) === JSON.stringify(value)
        );
      });
    if (!same)
      throw new Error('Source configuration changed. Reload project sources.');
  }
  const catalogs =
    snapshot.project === manifest.project.id
      ? snapshot.sources.filter((source) => source.enabled)
      : [];
  const names = {
    tools: new Set(
      manifest.tools.filter((item) => item.enabled).map((item) => item.name)
    ),
    resources: new Set(
      manifest.resources.filter((item) => item.enabled).map((item) => item.name)
    ),
    prompts: new Set(
      manifest.prompts.filter((item) => item.enabled).map((item) => item.name)
    )
  };
  const uris = new Set(
    manifest.resources.filter((item) => item.enabled).map((item) => item.uri)
  );
  for (const source of catalogs) {
    if (source.status !== 'ready')
      throw new Error(`Source ${source.id} is not ready.`);
    for (const category of ['tools', 'resources', 'prompts'] as const) {
      for (const item of source.catalog[category]) {
        if (names[category].has(item.name))
          throw new Error(
            `Duplicate ${category} name "${item.name}" in source ${source.id}. Rename it or disable the source.`
          );
        names[category].add(item.name);
      }
    }
    for (const resource of source.catalog.resources) {
      if (uris.has(resource.uri))
        throw new Error(
          `Duplicate resource URI "${resource.uri}" in source ${source.id}.`
        );
      uris.add(resource.uri);
    }
  }
  return { snapshot, catalogs };
}
