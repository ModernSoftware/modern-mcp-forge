import { getActiveProjectContext } from '$lib/server/project/loader';
export const load = () => ({ activeProject: getActiveProjectContext() });
