import { loadProjectManifest } from '$lib/server/project/loader';

export interface McpRuntimeSummary {
  serverName: string;
  serverVersion: string;
  enabledTools: number;
  tools: Array<{
    name: string;
    runtime: string;
  }>;
  endpoint: string;
}

export function getMcpRuntimeSummary(): McpRuntimeSummary {
  const manifest = loadProjectManifest();
  const tools = manifest.tools
    .filter((tool) => tool.enabled)
    .map((tool) => ({
      name: tool.name,
      runtime: tool.runtime
    }));

  return {
    serverName: manifest.server.name,
    serverVersion: manifest.server.version,
    enabledTools: tools.length,
    tools,
    endpoint: '/mcp'
  };
}
