import { error, redirect } from '@sveltejs/kit';
import { getActiveProjectRecord } from '$lib/server/projects/project-service';
import { nativeDocument, readNativeFile } from '$lib/server/sources/authoring';
import { projectSources } from '$lib/server/sources/manager';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ params }) => {
  const project = getActiveProjectRecord();
  if (!project) redirect(303, '/projects');
  if (!['tools', 'resources', 'prompts'].includes(params.kind))
    error(404, 'Unknown capability kind.');
  const document = nativeDocument(project, params.id);
  const file = readNativeFile(project, params.id, document.files[0]);
  const manifest = JSON.parse(file.content);
  const definition = manifest[params.kind]?.find(
    (item: { name: string }) => item.name === params.name
  );
  if (!definition) error(404, 'Capability not found.');
  let handlerFile: ReturnType<typeof readNativeFile> | null = null;
  let codeError = '';
  try {
    const worker = manifest.workers[definition.worker];
    const directory = document.files[0].split('/').slice(0, -1).join('/');
    const module = worker.module.replaceAll('\\', '/').replace(/^\.\//, '');
    handlerFile = readNativeFile(
      project,
      params.id,
      `${directory ? directory + '/' : ''}${module}`
    );
  } catch (failure) {
    codeError = failure instanceof Error ? failure.message : String(failure);
  }
  return {
    disabled:
      document.source.disabledCapabilities?.some(
        (item) => item.kind === params.kind && item.name === params.name
      ) ?? false,
    handlerFile,
    codeError,
    projectId: project.id,
    sourceId: params.id,
    kind: params.kind as 'tools' | 'resources' | 'prompts',
    definition: definition as Record<string, unknown>,
    revision: file.revision,
    snapshot: projectSources.snapshot()
  };
};
