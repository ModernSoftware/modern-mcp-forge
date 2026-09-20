import { getDatabase } from '$lib/server/database';

import { getActiveProjectKey } from '$lib/server/project/loader';

export interface ExecutionListItem {
  id: number;
  executionUid: string | null;
  toolName: string;
  runtime: string;
  entrypoint: string | null;
  status: string;
  startedAt: string;
  durationMs: number | null;
  exitCode: number | null;
}

export interface ExecutionDetail
  extends ExecutionListItem {
  completedAt: string | null;
  argumentsJson: string | null;
  resultJson: string | null;
  stderrText: string | null;
  errorText: string | null;
}

interface ListRow {
  id: number;
  execution_uid: string | null;
  tool_name: string;
  runtime: string;
  entrypoint: string | null;
  status: string;
  started_at: string;
  duration_ms: number | null;
  exit_code: number | null;
}

interface DetailRow
  extends ListRow {
  completed_at: string | null;
  arguments_json: string | null;
  result_json: string | null;
  stderr_text: string | null;
  error_text: string | null;
}

export function listExecutions(limit = 50): ExecutionListItem[] {
  const projectId = getActiveProjectKey();

  const rows =
    getDatabase()
      .query<
        ListRow,
        [string, number]
      >(`
        SELECT
          id,
          execution_uid,
          tool_name,
          runtime,
          entrypoint,
          status,
          started_at,
          duration_ms,
          exit_code
        FROM tool_executions
        WHERE project_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(
        projectId,
        limit
      );

  return rows.map(
    (row) => ({
      id: row.id,
      executionUid: row.execution_uid,
      toolName: row.tool_name,
      runtime: row.runtime,
      entrypoint: row.entrypoint,
      status: row.status,
      startedAt: row.started_at,
      durationMs: row.duration_ms,
      exitCode: row.exit_code
    })
  );
}

export function getExecution(id: number): ExecutionDetail | null {
  const projectId = getActiveProjectKey();

  const row =
    getDatabase()
      .query<
        DetailRow,
        [number, string]
      >(`
        SELECT
          id,
          execution_uid,
          tool_name,
          runtime,
          entrypoint,
          status,
          started_at,
          completed_at,
          duration_ms,
          arguments_json,
          result_json,
          stderr_text,
          exit_code,
          error_text
        FROM tool_executions
        WHERE id = ?
          AND project_id = ?
      `)
      .get(
        id,
        projectId
      );

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    executionUid: row.execution_uid,
    toolName: row.tool_name,
    runtime: row.runtime,
    entrypoint: row.entrypoint,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    argumentsJson: row.arguments_json,
    resultJson: row.result_json,
    stderrText: row.stderr_text,
    exitCode: row.exit_code,
    errorText: row.error_text
  };
}

export function getExecutionStats() {
  const projectId = getActiveProjectKey();

  const row =
    getDatabase()
      .query<
        {
          total: number;
          succeeded: number;
          failed: number;
          avg_duration_ms:
            number | null;
        },
        [string]
      >(`
        SELECT
          COUNT(*) AS total,
          SUM(
            CASE
              WHEN status = 'succeeded'
              THEN 1
              ELSE 0
            END
          ) AS succeeded,
          SUM(
            CASE
              WHEN status = 'failed'
              THEN 1
              ELSE 0
            END
          ) AS failed,
          AVG(duration_ms) AS avg_duration_ms
        FROM tool_executions
        WHERE project_id = ?
      `)
      .get(projectId);

  return {
    total: row?.total ?? 0,
    succeeded: row?.succeeded ?? 0,
    failed: row?.failed ?? 0,
    averageDurationMs: Math.round( row?.avg_duration_ms ?? 0)
  };
}
