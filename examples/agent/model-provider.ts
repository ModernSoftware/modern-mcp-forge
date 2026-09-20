import { createAnthropic } from '@ai-sdk/anthropic';
import { VercelModel } from '@strands-agents/sdk/models/vercel';
import { createOllama } from 'ai-sdk-ollama';

import type { AgentProfile } from './config';
import { resolveOptionalSecret } from './config';

export function createAgentModel(profile: AgentProfile): VercelModel {
  const common = {
    maxTokens: profile.maxTokens,
    temperature: profile.temperature,
    topP: profile.topP
  };

  switch (profile.provider) {
    case 'anthropic': {
      const apiKey = resolveOptionalSecret(profile.apiKeyEnv ?? 'ANTHROPIC_API_KEY');

      const anthropic = createAnthropic({
        apiKey,
        ...(profile.baseUrl
          ? {
              baseURL: profile.baseUrl
            }
          : {})
      });

      return new VercelModel({
        provider: anthropic(profile.model),
        ...common
      });
    }

    case 'ollama': {
      const apiKey = profile.apiKeyEnv
        ? resolveOptionalSecret(profile.apiKeyEnv)
        : undefined;

      const ollama = createOllama({
        baseURL: profile.baseUrl ?? 'http://localhost:11434',
        ...(apiKey
          ? {
              apiKey
            }
          : {})
      });

      return new VercelModel({
        provider: ollama(profile.model),
        ...common
      });
    }
  }
}
