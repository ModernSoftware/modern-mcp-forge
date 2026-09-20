import { resolve } from 'node:path';

import { resolveNodeCommand } from '$lib/server/execution/node-command';
import { resolvePythonCommand } from '$lib/server/execution/python-command';
import { getProjectRoot } from '$lib/server/project/loader';
import type { ToolDefinition } from '$lib/server/project/schema';

export interface ToolCommand {
  command: string[];
  cwd: string;
  entrypoint: string;
}

export function resolveToolCommand(definition: ToolDefinition): ToolCommand {
  const projectRoot = getProjectRoot();
  const entrypoint = resolve(projectRoot, definition.entrypoint);
  const cwd = resolve(projectRoot, definition.cwd ?? '.');

  switch (definition.runtime) {
    case 'bun':
      return {
        command: [process.execPath, entrypoint],
        cwd,
        entrypoint
      };

    case 'node': {
      const node = resolveNodeCommand();

      return {
        command: [node.executable, ...node.prefixArgs, entrypoint],
        cwd,
        entrypoint
      };
    }

    case 'python': {
      const python = resolvePythonCommand();

      return {
        command: [python.executable, ...python.prefixArgs, entrypoint],
        cwd,
        entrypoint
      };
    }

    case 'dotnet':
      throw new Error('.NET tool execution is not implemented in this release.');

    default:
      throw new Error(`Unsupported tool runtime: ${definition.runtime}`);
  }
}
