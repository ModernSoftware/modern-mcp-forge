import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';

import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type {
  ForgeProjectManifest,
  PromptDefinition,
  ResourceDefinition,
  ToolDefinition
} from '$lib/server/project/schema';

export function createTempDirectory(prefix = 'modern-mcp-forge-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function removeTempDirectory(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

export function createManifest(input?: {
  id?: string;
  name?: string;
  tools?: ToolDefinition[];
  resources?: ResourceDefinition[];
  prompts?: PromptDefinition[];
}): ForgeProjectManifest {
  const name = input?.name ?? 'test-project';

  return {
    schemaVersion: 1,
    project: {
      id: input?.id ?? crypto.randomUUID(),
      name
    },
    server: {
      name,
      version: '0.1.0',
      instructions: `Test server for ${name}`
    },
    tools: input?.tools ?? [],
    resources: input?.resources ?? [],
    prompts: input?.prompts ?? []
  };
}

export function writeProject(
  root: string,
  manifest = createManifest()
): string {
  mkdirSync(root, { recursive: true });

  for (const folder of ['tools', 'resources', 'prompts']) {
    mkdirSync(join(root, folder), { recursive: true });
  }

  const manifestPath = join(root, 'forge.project.json');
  writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  return manifestPath;
}

export function writeTextFile(path: string, content: string): void {
  writeFileSync(path, content, 'utf8');
}
