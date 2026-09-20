import {
  FORGE_TOOL_ABI_VERSION,
  ForgeToolExecutionResponseSchema,
  type ForgeToolExecutionRequest,
  type ForgeToolResult
} from '$lib/server/execution/protocol';
import { ToolProcessError } from '$lib/server/execution/errors';
import { resolveToolCommand } from '$lib/server/execution/command';
import { getProjectRoot } from '$lib/server/project/loader';
import type { ToolDefinition } from '$lib/server/project/schema';

export interface ExternalToolExecution {
  result: ForgeToolResult;
  stderr: string;
  stdout: string;
  exitCode: number;
  entrypoint: string;
}

function parseToolResponse(
  stdout: string,
  stderr: string,
  exitCode: number
): ForgeToolResult {
  const trimmed = stdout.trim();

  if (!trimmed) {
    throw new ToolProcessError(
      'Tool produced no protocol response on stdout.',
      { stdout, stderr, exitCode }
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new ToolProcessError(
      'Tool stdout was not a valid Forge Tool ABI JSON response. Remember: logs belong on stderr, not stdout.',
      { stdout, stderr, exitCode, cause: error }
    );
  }

  const response = ForgeToolExecutionResponseSchema.safeParse(parsed);

  if (!response.success) {
    throw new ToolProcessError(
      `Tool returned JSON that does not satisfy Forge Tool ABI v${FORGE_TOOL_ABI_VERSION}: ${response.error.message}`,
      { stdout, stderr, exitCode }
    );
  }

  if (response.data.status === 'error') {
    throw new ToolProcessError(
      `${response.data.error.code}: ${response.data.error.message}`,
      { stdout, stderr, exitCode }
    );
  }

  return response.data.result;
}

export async function executeExternalTool(
  definition: ToolDefinition,
  args: Record<string, unknown>,
  executionId: string
): Promise<ExternalToolExecution> {
  const resolved = resolveToolCommand(definition);

  const request: ForgeToolExecutionRequest = {
    protocolVersion: FORGE_TOOL_ABI_VERSION,
    executionId,
    tool: {
      name: definition.name
    },
    arguments: args,
    context: {
      projectRoot: getProjectRoot()
    }
  };

  let subprocess;

  try {
    subprocess = Bun.spawn({
      cmd: resolved.command,
      cwd: resolved.cwd,
      env: {
        ...processEnv(),
        MCP_FORGE_EXECUTION_ID: executionId,
        MCP_FORGE_TOOL_NAME: definition.name,
        MCP_FORGE_ABI_VERSION: String(FORGE_TOOL_ABI_VERSION)
      },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: definition.timeoutMs,
      maxBuffer: definition.maxOutputBytes,
      windowsHide: true
    });
  } catch (error) {
    throw new ToolProcessError(
      `Failed to start ${definition.runtime} tool "${definition.name}".`,
      { cause: error }
    );
  }

  subprocess.stdin.write(JSON.stringify(request));
  subprocess.stdin.end();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited
  ]);

  if (exitCode !== 0) {
    throw new ToolProcessError(
      `Tool "${definition.name}" exited with code ${exitCode}.`,
      { stdout, stderr, exitCode }
    );
  }

  const result = parseToolResponse(stdout, stderr, exitCode);

  return {
    result,
    stderr,
    stdout,
    exitCode,
    entrypoint: resolved.entrypoint
  };
}

function processEnv(): Record<string, string | undefined> {
  return { ...process.env };
}
