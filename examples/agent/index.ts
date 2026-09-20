import { createInterface } from 'node:readline/promises';
import { Agent, McpClient } from '@strands-agents/sdk';
import { createAgentModel } from './model-provider';

import {
  getProfile,
  loadAgentConfig,
  parseCliOptions
} from './config';

function separator(): void {
  console.log('----------------------------------------');
}

async function readPromptFromTerminal(): Promise<string> {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    return (await terminal.question('\nPrompt:\n> ')).trim();
  } finally {
    terminal.close();
  }
}

async function main(): Promise<void> {
  const options = parseCliOptions(
    process.argv.slice(2)
  );

  const config = loadAgentConfig(
    options.configPath
  );

  if (options.listProfiles) {
    console.log('Modern MCP Forge agent profiles\n');

    for (const [name, profile] of Object.entries(config.profiles)) {
      const marker = name === config.defaultProfile ? '*' : ' ';

      console.log(
        `${marker} ${name.padEnd(18)} ${profile.provider.padEnd(10)} ${profile.model}`
      );
    }

    console.log('\n* default profile');

    return;
  }

  const {
    name: profileName,
    profile
  } = getProfile(
    config,
    options.profile
  );

  console.log('\nModern MCP Forge Agent Demo');
  separator();
  console.log(`Framework : Strands Agents`);
  console.log(`Profile   : ${profileName}`);
  console.log(`Provider  : ${profile.provider}`);
  console.log(`Model     : ${profile.model}`);
  console.log(`MCP       : ${config.mcp.url}`);

  const model = createAgentModel(profile);

  const mcpClient = new McpClient({ url: config.mcp.url });

  try {
    console.log('\nConnecting to Modern MCP Forge...');

    const tools = await mcpClient.listTools();

    if (tools.length === 0) {
      throw new Error('Forge exposed no MCP tools.');
    }

    console.log(`Connected. Discovered ${tools.length} tools:`);

    for (const tool of tools) {
      console.log(`  - ${tool.name}`);
    }

    const agent = new Agent({
      model,
      tools,
      systemPrompt: config.systemPrompt,
      printer: false
    });

    const prompt = options.prompt ?? (await readPromptFromTerminal());

    if (!prompt) {
      throw new Error('Prompt cannot be empty.');
    }

    separator();
    console.log('User');
    console.log(prompt);
    separator();
    console.log('Agent running...\n');

    const result = await agent.invoke(
      prompt,
      {
        limits: {
          turns: config.limits.turns,
          outputTokens: config.limits.outputTokens,
          totalTokens: config.limits.totalTokens
        }
      }
    );

    separator();
    console.log('Final answer');
    console.log(result.toString());
    separator();

    if (result.metrics) {
      console.log(`Stop reason: ${result.stopReason}`);
      console.log(
        `Agent cycles: ${
          result.metrics.cycleCount ??
          'n/a'
        }`
      );
    }

    console.log('\nOpen Forge /executions to inspect MCP tool calls made by the agent.');
  } finally {
    await mcpClient.disconnect();
  }
}

main().catch((error) => {
  console.error('\nAgent demo failed.');

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
});
