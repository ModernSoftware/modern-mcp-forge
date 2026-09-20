import { loadProjectManifest } from '$lib/server/project/loader';

import { getPromptSourceInfo } from '$lib/server/project/prompt-source-service';

export function getWorkbenchPrompts() {
  const manifest = loadProjectManifest();

  return manifest.prompts
    .map((prompt) => ({
      ...prompt,
      sourceInfo: getPromptSourceInfo(prompt.name)
    }));
}

export function getWorkbenchPrompt(name: string) {
  return (
    getWorkbenchPrompts().find((prompt) => prompt.name === name) ?? null
  );
}
