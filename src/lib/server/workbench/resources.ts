import { loadProjectManifest } from '$lib/server/project/loader';
import { getResourceSourceInfo } from '$lib/server/project/resource-source-service';

export function getWorkbenchResources() {
  const manifest = loadProjectManifest();

  return manifest.resources
    .map((resource) => ({
      ...resource,
      sourceInfo: getResourceSourceInfo(resource.name)
    }));
}

export function getWorkbenchResource(name: string) {
  return (
    getWorkbenchResources().find((resource) => resource.name === name) ?? null
  );
}
