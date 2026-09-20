import {
  redirect
} from '@sveltejs/kit';

import type {
  PageServerLoad
} from './$types';

import {
  getHealthStatus
} from '$lib/server/health';

import {
  getActiveProjectContext
} from '$lib/server/project/loader';

import {
  getExecutionStats,
  listExecutions
} from '$lib/server/workbench/executions';

import {
  getWorkbenchPrompts
} from '$lib/server/workbench/prompts';

import {
  getWorkbenchResources
} from '$lib/server/workbench/resources';

import {
  getWorkbenchTools
} from '$lib/server/workbench/tools';

export const load:
  PageServerLoad =
  async () => {
    const project =
      getActiveProjectContext();

    if (!project) {
      throw redirect(
        303,
        '/projects'
      );
    }

    const tools =
      getWorkbenchTools();

    const resources =
      getWorkbenchResources();

    const prompts =
      getWorkbenchPrompts();

    const executionStats =
      getExecutionStats();

    return {
      project,
      health:
        getHealthStatus(),
      tools:
        tools.map(
          (tool) => ({
            name:
              tool.name,
            runtime:
              tool.runtime,
            ready:
              tool.runtimeStatus.ready
          })
        ),
      stats: {
        tools:
          tools.length,
        resources:
          resources.length,
        prompts:
          prompts.length,
        runtimes:
          new Set(
            tools.map(
              (tool) =>
                tool.runtime
            )
          ).size,
        ...executionStats
      },
      recentExecutions:
        listExecutions(5)
    };
  };
