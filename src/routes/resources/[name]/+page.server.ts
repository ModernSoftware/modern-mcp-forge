import {
  error
} from '@sveltejs/kit';

import type {
  PageServerLoad
} from './$types';

import {
  getResourceSourceInfo
} from '$lib/server/project/resource-source-service';

import {
  getWorkbenchResource
} from '$lib/server/workbench/resources';

export const load:
  PageServerLoad =
  async ({ params }) => {
    const resource =
      getWorkbenchResource(
        params.name
      );

    if (!resource) {
      error(
        404,
        `Resource "${params.name}" was not found.`
      );
    }

    return {
      resource,
      source:
        getResourceSourceInfo(
          params.name
        )
    };
  };
