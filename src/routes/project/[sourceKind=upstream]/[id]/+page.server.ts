import { projectSources } from '$lib/server/sources/manager';
import { error } from '@sveltejs/kit';
import { load as workspace } from '../../../workspace/+page.server';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ params }) => {
  const data = workspace();
  const source = data.sources.find(
    (entry) => entry.source.id === params.id
  )?.source;
  if (!source || source.kind === 'native' || source.kind !== params.sourceKind)
    error(404, 'Connection not found.');
  return { ...data, source, inspection: projectSources.inspect(source.id) };
};
