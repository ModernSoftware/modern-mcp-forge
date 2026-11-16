export type ExecutionOrigin = 'mcp' | 'workbench' | 'named-case';

export function executionOriginLabel(origin: string | null) {
  switch (origin) {
    case 'mcp':
      return 'MCP client';
    case 'workbench':
      return 'Workbench test';
    case 'named-case':
      return 'Named test case';
  }
}
