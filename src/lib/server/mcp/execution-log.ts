import { getDatabase } from '$lib/server/database';
import { getActiveProjectKey } from '$lib/server/project/loader';

export interface ExecutionRecord {
  id: number;
  executionUid: string;
  startedAt: number;
}

export function startToolExecution(
  toolName: string,
  runtime: string,
  args: Record<string, unknown>,
  entrypoint?: string
): ExecutionRecord {
  const startedAt = Date.now();

  const startedAtIso = new Date(startedAt).toISOString();

  const executionUid = crypto.randomUUID();

  const projectId = getActiveProjectKey();

  const row =
    getDatabase()
      .query<
        { id: number },
        [
          string,
          string,
          string,
          string,
          string,
          string,
          string | null
        ]
      >(`
        INSERT INTO tool_executions (
          project_id,
          execution_uid,
          tool_name,
          runtime,
          status,
          started_at,
          arguments_json,
          entrypoint
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          'running',
          ?,
          ?,
          ?
        )
        RETURNING id
      `)
      .get(
        projectId,
        executionUid,
        toolName,
        runtime,
        startedAtIso,
        JSON.stringify(args),
        entrypoint ?? null
      );

  if (!row) {
    throw new Error(`Could not create execution record for tool "${toolName}".`);
  }

  return {
    id: row.id,
    executionUid,
    startedAt
  };
}

export function completeToolExecution(
  execution: ExecutionRecord,
  result: unknown,
  diagnostics?: {
    stderr?: string;
    exitCode?: number | null;
    entrypoint?: string;
  }
): void {
  const completedAt = Date.now();

  getDatabase()
    .query<
      void,
      [
        string,
        number,
        string,
        string | null,
        number | null,
        string | null,
        number
      ]
    >(`
      UPDATE tool_executions
      SET
        status = 'succeeded',
        completed_at = ?,
        duration_ms = ?,
        result_json = ?,
        stderr_text = ?,
        exit_code = ?,
        entrypoint = COALESCE(?, entrypoint)
      WHERE id = ?
    `)
    .run(
      new Date(completedAt).toISOString(),
      completedAt - execution.startedAt,
      JSON.stringify(result),
      diagnostics?.stderr ?? null,
      diagnostics?.exitCode ?? null,
      diagnostics?.entrypoint ?? null,
      execution.id
    );
}

export function failToolExecution(
  execution: ExecutionRecord,
  error: unknown,
  diagnostics?: {
    stderr?: string;
    exitCode?: number | null;
    entrypoint?: string;
  }
): void {
  const completedAt = Date.now();

  const message =
    error instanceof Error
      ? error.stack ??
        error.message
      : String(error);

  getDatabase()
    .query<
      void,
      [
        string,
        number,
        string,
        string | null,
        number | null,
        string | null,
        number
      ]
    >(`
      UPDATE tool_executions
      SET
        status = 'failed',
        completed_at = ?,
        duration_ms = ?,
        error_text = ?,
        stderr_text = ?,
        exit_code = ?,
        entrypoint = COALESCE(?, entrypoint)
      WHERE id = ?
    `)
    .run(
      new Date(completedAt).toISOString(),
      completedAt - execution.startedAt,
      message,
      diagnostics?.stderr ?? null,
      diagnostics?.exitCode ?? null,
      diagnostics?.entrypoint ?? null,
      execution.id
    );
}
