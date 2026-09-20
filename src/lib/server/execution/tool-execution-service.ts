import type { CallToolResult } from '@modelcontextprotocol/server';

import { ToolProcessError } from '$lib/server/execution/errors';
import { executeExternalTool } from '$lib/server/execution/process-runner';
import {
  completeToolExecution,
  failToolExecution,
  startToolExecution
} from '$lib/server/mcp/execution-log';
import { loadProjectManifest } from '$lib/server/project/loader';
import type { ToolDefinition } from '$lib/server/project/schema';

export class ToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`Tool "${toolName}" is not registered or is disabled.`);
    this.name = 'ToolNotFoundError';
  }
}

export interface ToolExecutionOutcome {
  databaseId: number;
  executionId: string;
  toolName: string;
  runtime: ToolDefinition['runtime'];
  status: 'succeeded' | 'failed';
  durationMs: number;
  result: CallToolResult;
  stderr: string;
  exitCode: number | null;
  entrypoint: string | null;
}

export async function executeToolDefinition(
  definition: ToolDefinition,
  args: Record<string, unknown>
): Promise<ToolExecutionOutcome> {
  const execution = startToolExecution(
    definition.name,
    definition.runtime,
    args,
    definition.entrypoint
  );

  try {
    const external = await executeExternalTool(
      definition,
      args,
      execution.executionUid
    );

    const result: CallToolResult = {
      content: external.result.content,
      structuredContent: external.result.structuredContent
    };

    completeToolExecution(execution, result, {
      stderr: external.stderr,
      exitCode: external.exitCode,
      entrypoint: external.entrypoint
    });

    return {
      databaseId: execution.id,
      executionId: execution.executionUid,
      toolName: definition.name,
      runtime: definition.runtime,
      status: 'succeeded',
      durationMs: Date.now() - execution.startedAt,
      result,
      stderr: external.stderr,
      exitCode: external.exitCode,
      entrypoint: external.entrypoint
    };
  } catch (error) {
    const processError = error instanceof ToolProcessError ? error : undefined;

    failToolExecution(execution, error, {
      stderr: processError?.stderr,
      exitCode: processError?.exitCode,
      entrypoint: definition.entrypoint
    });

    const result: CallToolResult = {
      isError: true,
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : String(error)
        }
      ]
    };

    return {
      databaseId: execution.id,
      executionId: execution.executionUid,
      toolName: definition.name,
      runtime: definition.runtime,
      status: 'failed',
      durationMs: Date.now() - execution.startedAt,
      result,
      stderr: processError?.stderr ?? '',
      exitCode: processError?.exitCode ?? null,
      entrypoint: definition.entrypoint
    };
  }
}

export async function executeToolByName(
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolExecutionOutcome> {
  const manifest = loadProjectManifest();
  const definition = manifest.tools.find(
    (tool) => tool.enabled && tool.name === toolName
  );

  if (!definition) {
    throw new ToolNotFoundError(toolName);
  }

  return executeToolDefinition(definition, args);
}
