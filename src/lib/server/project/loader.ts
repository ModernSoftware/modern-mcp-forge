import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getProcessProjectManifestPath } from '$lib/server/project/project-selection';
import { ForgeProjectManifestSchema, type ForgeProjectManifest } from '$lib/server/project/schema';
import { getActiveProjectRecord } from '$lib/server/projects/project-service';

export class NoActiveProjectError extends Error {
  constructor() {
    super('No Modern MCP Forge project is currently open.');
    this.name = 'NoActiveProjectError';
  }
}

export interface ActiveProjectContext {
  id: string;
  name: string;
  path: string;
  manifestPath: string;
}

export function getProjectManifestPath(): string {
  const processManifestPath = getProcessProjectManifestPath();

  if (processManifestPath) {
    return processManifestPath;
  }

  const active = getActiveProjectRecord();

  if (!active?.available) {
    throw new NoActiveProjectError();
  }

  return join(active.path, 'forge.project.json');
}

export function getProjectRoot(): string {
  return dirname(getProjectManifestPath());
}

export function hasActiveProject(): boolean {
  try {
    return existsSync(getProjectManifestPath());
  } catch {
    return false;
  }
}

export function loadProjectManifest(): ForgeProjectManifest {
  const manifestPath = getProjectManifestPath();
  const raw = readFileSync(manifestPath, 'utf8');

  return ForgeProjectManifestSchema.parse(JSON.parse(raw));
}

export function getActiveProjectContext(): ActiveProjectContext | null {
  if (!hasActiveProject()) {
    return null;
  }

  const manifestPath = getProjectManifestPath();
  const manifest = loadProjectManifest();

  return {
    id: manifest.project.id,
    name: manifest.project.name,
    path: dirname(manifestPath),
    manifestPath
  };
}

export function getActiveProjectKey(): string {
  const context = getActiveProjectContext();

  if (!context) {
    throw new NoActiveProjectError();
  }

  return context.id;
}
