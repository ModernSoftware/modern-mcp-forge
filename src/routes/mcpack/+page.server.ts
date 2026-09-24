import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { nativeProjects } from '$lib/server/mcpack/session';
import { validateLocalRequest } from '$lib/server/local-request-guard';

export const load: PageServerLoad = ({ request }) => {
  if (validateLocalRequest(request))
    throw error(403, 'Native projects are available only locally.');
  return { nativeProject: nativeProjects.snapshot() };
};
