import { loadProjectManifest } from '$lib/server/project/loader';
import type { DefinitionKind } from '$lib/server/project/manifest-service';

export function getDefinition(kind: DefinitionKind, name: string) {
  const manifest = loadProjectManifest();

  switch (kind) {
    case 'tool':
      return manifest.tools.find((item) => item.name === name) ?? null;
    case 'resource':
      return manifest.resources.find((item) => item.name === name) ?? null;
    case 'prompt':
      return manifest.prompts.find((item) => item.name === name) ?? null;
  }
}

export function listDefinitions() {
  const manifest = loadProjectManifest();

  return {
    tools: manifest.tools,
    resources: manifest.resources,
    prompts: manifest.prompts
  };
}
