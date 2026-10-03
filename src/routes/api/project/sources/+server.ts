import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateLocalRequest } from '$lib/server/local-request-guard';
import { getActiveProjectRecord } from '$lib/server/projects/project-service';
import { projectTransition } from '$lib/server/mcpack/project-transition';
import { projectSources } from '$lib/server/sources/manager';
import { startProjectSources } from '$lib/server/sources/project';

export const GET: RequestHandler = ({ request }) => {
  const rejected = validateLocalRequest(request);
  return rejected ?? json(projectSources.snapshot());
};

export const POST: RequestHandler = async ({ request }) => {
  const rejected = validateLocalRequest(request);
  if (rejected) return rejected;
  try {
    const input = await request.json();
    if (input?.action !== 'reload' || typeof input.projectId !== 'string') {
      return json({ error: 'reload and projectId are required.' }, { status: 400 });
    }
    return await projectTransition(async () => {
      const project = getActiveProjectRecord();
      if (!project || project.id !== input.projectId) {
        return json({ error: 'Selected project changed.' }, { status: 409 });
      }
      const snapshot = await startProjectSources(project);
      return json(snapshot, { status: snapshot.error ? 503 : 200 });
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
};
