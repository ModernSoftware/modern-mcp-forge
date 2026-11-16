import type { RequestHandler } from './$types';
import { handleConnectionRequest } from '$lib/server/sources/connection-api';

export const POST: RequestHandler = ({ request }) =>
  handleConnectionRequest(request, 'bridge');
