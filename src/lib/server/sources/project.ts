import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ForgeProjectManifestSchema } from '../project/schema';
import type { RegisteredProject } from '../projects/project-service';
import { projectSources } from './manager';

export async function startProjectSources(project: RegisteredProject) {
  const manifest = ForgeProjectManifestSchema.parse(
    JSON.parse(await readFile(join(project.path, 'forge.project.json'), 'utf8'))
  );
  return projectSources.open(project.id, project.path, manifest.sources ?? []);
}
