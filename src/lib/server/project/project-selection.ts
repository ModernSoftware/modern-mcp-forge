import { resolve } from 'node:path';

let processProjectManifestPath: string | null = null;

export function selectProjectForProcess(manifestPath: string): void {
  processProjectManifestPath = resolve(manifestPath);
}

export function getProcessProjectManifestPath(): string | null {
  return processProjectManifestPath;
}

export function clearProjectForProcess(): void {
  processProjectManifestPath = null;
}
