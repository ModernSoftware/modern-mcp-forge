import { loadProjectManifest } from '$lib/server/project/loader';
import { getRuntimeStatus } from '$lib/server/workbench/runtime-status';

export function getWorkbenchTools() {
  const manifest = loadProjectManifest();

  return manifest.tools
    .map((tool) => ({
      ...tool,
      runtimeStatus: getRuntimeStatus(tool.runtime)
    }));
}

export function getWorkbenchTool(name: string) {
  return getWorkbenchTools().find((tool) => tool.name === name) ?? null;
}
