import { error } from '@sveltejs/kit';
import { load as workspace } from '../../../workspace/+page.server';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ params }) => {
  const data = workspace();
  const source = data.sources.find(
    (entry) => entry.source.id === params.id
  )?.source;
  if (!source || source.kind !== 'external')
    error(404, 'External source not found.');
  return { ...data, source };
};
