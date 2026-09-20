import { resolveNodeCommand } from '$lib/server/execution/node-command';
import { resolvePythonCommand } from '$lib/server/execution/python-command';
import type { ToolDefinition } from '$lib/server/project/schema';

export interface RuntimeStatus {
  ready: boolean;
  detail: string;
}

export function getRuntimeStatus(runtime: ToolDefinition['runtime']): RuntimeStatus {
  switch (runtime) {
    case 'bun':
      return {
        ready: Boolean(process.execPath),
        detail: process.execPath
      };

    case 'node':
      try {
        const node = resolveNodeCommand();
        return {
          ready: true,
          detail: [node.executable, ...node.prefixArgs].join(' ')
        };
      } catch (error) {
        return {
          ready: false,
          detail: error instanceof Error ? error.message : String(error)
        };
      }

    case 'python':
      try {
        const python = resolvePythonCommand();
        return {
          ready: true,
          detail: [python.executable, ...python.prefixArgs].join(' ')
        };
      } catch (error) {
        return {
          ready: false,
          detail: error instanceof Error ? error.message : String(error)
        };
      }

    case 'dotnet': {
      const dotnet = Bun.which('dotnet');
      return {
        ready: dotnet !== null,
        detail: dotnet ?? '.NET runtime not found on PATH'
      };
    }

    default:
      return {
        ready: false,
        detail: `Unsupported runtime: ${runtime}`
      };
  }
}
