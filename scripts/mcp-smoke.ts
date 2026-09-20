import {
  Client,
  StreamableHTTPClientTransport
} from '@modelcontextprotocol/client';

const endpoint = process.env.MCP_FORGE_URL ?? 'http://localhost:5173/mcp';

interface ProjectStatusResponse {
  active: boolean;
  project?: {
    id: string;
    name: string;
    path: string;
  } | null;
}

async function checkProjectStatus(): Promise<boolean> {
  const endpointUrl = new URL(endpoint);
  const statusUrl = new URL('/api/projects/status', endpointUrl);

  try {
    const response = await fetch(statusUrl);

    if (!response.ok) {
      return true;
    }

    const status = (await response.json()) as ProjectStatusResponse;

    if (!status.active) {
      console.log('No active Forge project. /mcp is intentionally unavailable in this state.');
      console.log('MCP no-project state: OK');
      return false;
    }

    console.log(`Active project: ${status.project?.name ?? 'unknown'}`);
  } catch {
    // If the status endpoint is unavailable, continue with the actual MCP probe.
  }

  return true;
}

if (!(await checkProjectStatus())) {
  process.exit(0);
}

const client = new Client(
  {
    name: 'modern-mcp-forge-smoke-test',
    version: '1.0.0'
  },
  {
    versionNegotiation: {
      mode: 'auto'
    }
  }
);

const transport = new StreamableHTTPClientTransport(new URL(endpoint));

try {
  console.log(`Connecting to ${endpoint} ...`);

  await client.connect(transport);

  console.log(`Protocol era: ${client.getProtocolEra() ?? 'unknown'}`);

  const toolsResult = await client.listTools();
  const toolNames = toolsResult.tools.map((tool) => tool.name);

  console.log(`Tools: ${toolNames.length === 0 ? '(none)' : toolNames.join(', ')}`);

  const resourcesResult = await client.listResources();

  console.log(
    `Resources: ${
      resourcesResult.resources.length === 0
        ? '(none)'
        : resourcesResult.resources
            .map((resource) => `${resource.name} <${resource.uri}>`)
            .join(', ')
    }`
  );

  if (resourcesResult.resources.length > 0) {
    const first = resourcesResult.resources[0];
    const readResult = await client.readResource({ uri: first.uri });

    if (readResult.contents.length === 0) {
      throw new Error(`Resource "${first.name}" returned no content.`);
    }

    console.log(`resource read (${first.name}): OK`);
  }

  const promptsResult = await client.listPrompts();

  console.log(
    `Prompts: ${
      promptsResult.prompts.length === 0
        ? '(none)'
        : promptsResult.prompts.map((prompt) => prompt.name).join(', ')
    }`
  );

  if (promptsResult.prompts.length > 0) {
    const first = promptsResult.prompts[0];
    const argumentsObject: Record<string, string> = {};

    for (const argument of first.arguments ?? []) {
      argumentsObject[argument.name] = `smoke-${argument.name}`;
    }

    const promptResult = await client.getPrompt({
      name: first.name,
      arguments: argumentsObject
    });

    if (promptResult.messages.length === 0) {
      throw new Error(`Prompt "${first.name}" returned no messages.`);
    }

    console.log(`prompt render (${first.name}): OK`);
  }

  console.log('MCP project smoke test passed.');
} finally {
  await client.close().catch(() => undefined);
}
