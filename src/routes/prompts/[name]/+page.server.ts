import {
  error
} from '@sveltejs/kit';

import type {
  PageServerLoad
} from './$types';

import {
  getPromptSourceInfo
} from '$lib/server/project/prompt-source-service';

import {
  getWorkbenchPrompt
} from '$lib/server/workbench/prompts';

export const load:
  PageServerLoad =
  async ({ params }) => {
    const prompt =
      getWorkbenchPrompt(
        params.name
      );

    if (!prompt) {
      error(
        404,
        `Prompt "${params.name}" was not found.`
      );
    }

    return {
      prompt,
      source:
        getPromptSourceInfo(
          params.name
        )
    };
  };
