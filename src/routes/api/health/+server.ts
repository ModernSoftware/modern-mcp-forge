import { json } from '@sveltejs/kit';
import { getHealthStatus } from '$lib/server/health';

export function GET() {
  const health = getHealthStatus();

  return json(health, {
    status: health.status === 'ok' ? 200 : 503
  });
}
