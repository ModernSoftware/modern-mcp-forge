import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

const CommonProfileSchema = z.object({
  model: z.string().min(1),
  apiKeyEnv: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional()
});

const AnthropicProfileSchema = CommonProfileSchema.extend({
  provider: z.literal('anthropic')
});

const OllamaProfileSchema = CommonProfileSchema.extend({
  provider: z.literal('ollama')
});

const AgentProfileSchema = z.discriminatedUnion('provider', [
  AnthropicProfileSchema,
  OllamaProfileSchema
]);

const AgentConfigSchema = z.object({
  defaultProfile: z.string().min(1),
  mcp: z.object({
    url: z.string().url()
  }),
  systemPrompt: z.string().min(1),
  limits: z.object({
    turns: z.number().int().positive().optional(),
    outputTokens: z.number().int().positive().optional(),
    totalTokens: z.number().int().positive().optional()
  }).default({}),
  profiles: z.record(z.string(), AgentProfileSchema)
});

export type AgentProfile = z.infer<typeof AgentProfileSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export interface CliOptions {
  profile?: string;
  prompt?: string;
  configPath?: string;
  listProfiles: boolean;
}

export function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    listProfiles: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case '--profile':
        options.profile = argv[++index];
        break;

      case '--prompt':
        options.prompt = argv[++index];
        break;

      case '--config':
        options.configPath = argv[++index];
        break;

      case '--list-profiles':
        options.listProfiles = true;
        break;

      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;

      default:
        if (argument.startsWith('--')) {
          throw new Error(`Unknown option: ${argument}`);
        }
    }
  }

  return options;
}

export function printHelp(): void {
  console.log(`
    Modern MCP Forge Agent Demo

    Usage:
      bun run agent:demo -- [options]

    Options:
      --profile <name>     Select a model profile
      --prompt <text>      Run one prompt without interactive input
      --config <path>      Use another agent configuration file
      --list-profiles      Print configured profiles
      --help               Show this help

    Examples:
      bun run agent:demo -- --profile anthropic
      bun run agent:demo -- --profile ollama-local
      bun run agent:demo -- --profile anthropic --prompt "Hash Modern Software and count its characters."
    `);
}

export function loadAgentConfig(
  configuredPath?: string
): AgentConfig {
  const path = resolve(
    configuredPath ?? 'examples/agent/agent.config.json'
  );

  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw);

  return AgentConfigSchema.parse(parsed);
}

export function getProfile(config: AgentConfig, requestedProfile?: string): {
  name: string;
  profile: AgentProfile;
} {
  const name = requestedProfile ?? config.defaultProfile;
  const profile = config.profiles[name];

  if (!profile) {
    throw new Error(
      `Unknown agent profile "${name}". Available profiles: ${Object.keys(
        config.profiles
      ).join(', ')}`
    );
  }

  return {
    name,
    profile
  };
}

export function resolveOptionalSecret(environmentVariable?: string): string | undefined {
  if (!environmentVariable) {
    return undefined;
  }

  const value = process.env[environmentVariable];

  if (!value) {
    throw new Error(
      `Profile requires environment variable ${environmentVariable}, but it is not set.`
    );
  }

  return value;
}
