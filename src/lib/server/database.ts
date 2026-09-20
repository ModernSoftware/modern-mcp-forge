import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { resolveDefaultDatabasePath } from '$lib/server/app-data';

let database: Database | undefined;

export function resolveDatabasePath(): string {
  const explicitPath = process.env.MCP_FORGE_DB_PATH?.trim();

  return explicitPath
    ? resolve(explicitPath)
    : resolveDefaultDatabasePath();
}

function setMetadata(db: Database, key: string, value: string): void {
  db.query(`
    INSERT INTO app_metadata (
      key,
      value,
      updated_at
    )
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `).run(key, value);
}

function initializeSchema(db: Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      local_path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_projects_last_opened_at
      ON projects(last_opened_at DESC);

    CREATE TABLE IF NOT EXISTS tool_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      execution_uid TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      runtime TEXT NOT NULL,
      entrypoint TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER,
      arguments_json TEXT,
      result_json TEXT,
      stderr_text TEXT,
      exit_code INTEGER,
      error_text TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tool_executions_started_at
      ON tool_executions(started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_tool_executions_tool_name
      ON tool_executions(tool_name);

    CREATE INDEX IF NOT EXISTS idx_tool_executions_project_id
      ON tool_executions(project_id);

    CREATE INDEX IF NOT EXISTS idx_tool_executions_project_started
      ON tool_executions(project_id, started_at DESC);
  `);

  setMetadata(db, 'schema_version', '1');
}

export function getDatabase(): Database {
  if (database) {
    return database;
  }

  const path = resolveDatabasePath();
  mkdirSync(dirname(path), { recursive: true });

  database = new Database(path, {
    create: true,
    strict: true
  });

  initializeSchema(database);

  return database;
}

export function closeDatabase(): void {
  if (!database) {
    return;
  }

  database.close();
  database = undefined;
}

export function checkDatabase(): boolean {
  const row = getDatabase()
    .query<{ ok: number }, []>('SELECT 1 AS ok')
    .get();

  return row?.ok === 1;
}
