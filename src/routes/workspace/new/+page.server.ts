import { load as workspace } from '../+page.server';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ url }) => {
  const kind = url.searchParams.get('kind');
  return {
    ...workspace(),
    initialKind: kind === 'resources' || kind === 'prompts' ? kind : 'tools'
  };
};
