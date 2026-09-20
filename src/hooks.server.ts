import {
  redirect,
  type Handle
} from '@sveltejs/kit';

import { hasActiveProject } from '$lib/server/project/loader';

const projectPagePrefixes = [
  '/tools',
  '/resources',
  '/prompts',
  '/executions'
];

const projectApiPrefixes = [
  '/api/project/',
  '/api/tools/'
];

export const handle: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;

  if (hasActiveProject()) {
    return resolve(event);
  }

  if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
    return new Response(
      JSON.stringify({
        error: 'no_active_project',
        message: 'No Modern MCP Forge project is currently open.'
      }),
      {
        status: 503,
        headers: {
          'content-type': 'application/json'
        }
      }
    );
  }

  if (projectApiPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return new Response(
      JSON.stringify({
        error: 'no_active_project',
        message: 'Open or create a Forge project first.'
      }),
      {
        status: 409,
        headers: {
          'content-type': 'application/json'
        }
      }
    );
  }

  if (projectPagePrefixes.some((prefix) => pathname.startsWith(prefix))) {
    throw redirect(
      303,
      '/projects'
    );
  }

  return resolve(event);
};
