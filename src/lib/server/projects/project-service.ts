import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { getDatabase } from '$lib/server/database';
import {
  ForgeProjectManifestSchema,
  type ForgeProjectManifest
} from '$lib/server/project/schema';

const MANIFEST_FILE_NAME = 'forge.project.json';
const ACTIVE_PROJECT_KEY = 'active_project_id';

export interface RegisteredProject {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
  available: boolean;
}

interface ProjectRow {
  project_id: string;
  name: string;
  local_path: string;
  created_at: string;
  last_opened_at: string;
}

interface MetadataRow {
  value: string;
}

export class ProjectServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectServiceError';
  }
}

export class ProjectConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectConflictError';
  }
}

function normalizeProjectPath(path: string): string {
  return resolve(path);
}

function manifestPathFor(projectPath: string): string {
  return join(projectPath, MANIFEST_FILE_NAME);
}

function writeJsonAtomic(path: string, value: unknown): void {
  const tempPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${Date.now()}.tmp`
  );

  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    });

    JSON.parse(readFileSync(tempPath, 'utf8'));
    renameSync(tempPath, path);
  } finally {
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  }
}

function parseManifestFile(path: string): ForgeProjectManifest {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new ProjectServiceError(
      `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!parsedJson || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
    throw new ProjectServiceError('forge.project.json must contain a JSON object.');
  }

  const result = ForgeProjectManifestSchema.safeParse(parsedJson);

  if (!result.success) {
    throw new ProjectServiceError(
      `Invalid Forge project manifest: ${result.error.message}`
    );
  }

  return result.data;
}

function ensureStandardFolders(projectPath: string): void {
  for (const folderName of ['tools', 'resources', 'prompts']) {
    mkdirSync(join(projectPath, folderName), { recursive: true });
  }
}

function setMetadata(key: string, value: string): void {
  getDatabase()
    .query(`
      INSERT INTO app_metadata (
        key,
        value,
        updated_at
      )
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `)
    .run(key, value);
}

function deleteMetadata(key: string): void {
  getDatabase()
    .query(`
      DELETE FROM app_metadata
      WHERE key = ?
    `)
    .run(key);
}

function mapProjectRow(row: ProjectRow): RegisteredProject {
  const path = normalizeProjectPath(row.local_path);

  return {
    id: row.project_id,
    name: row.name,
    path,
    createdAt: row.created_at,
    lastOpenedAt: row.last_opened_at,
    available: existsSync(manifestPathFor(path))
  };
}

function registerProject(
  projectPath: string,
  manifest: ForgeProjectManifest
): RegisteredProject {
  const projectId = manifest.project.id;
  const db = getDatabase();

  db.query(`
    DELETE FROM projects
    WHERE local_path = ?
      AND project_id <> ?
  `).run(projectPath, projectId);

  db.query(`
    INSERT INTO projects (
      project_id,
      name,
      local_path,
      created_at,
      last_opened_at
    )
    VALUES (
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(project_id) DO UPDATE SET
      name = excluded.name,
      local_path = excluded.local_path,
      last_opened_at = CURRENT_TIMESTAMP
  `).run(projectId, manifest.project.name, projectPath);

  setMetadata(ACTIVE_PROJECT_KEY, projectId);

  const row = db
    .query<ProjectRow, [string]>(`
      SELECT
        project_id,
        name,
        local_path,
        created_at,
        last_opened_at
      FROM projects
      WHERE project_id = ?
    `)
    .get(projectId);

  if (!row) {
    throw new ProjectServiceError('Project was registered but could not be reloaded.');
  }

  return mapProjectRow(row);
}

export function listProjects(): RegisteredProject[] {
  const rows = getDatabase()
    .query<ProjectRow, []>(`
      SELECT
        project_id,
        name,
        local_path,
        created_at,
        last_opened_at
      FROM projects
      ORDER BY last_opened_at DESC
    `)
    .all();

  return rows.map(mapProjectRow);
}

export function getActiveProjectRecord(): RegisteredProject | null {
  const metadata = getDatabase()
    .query<MetadataRow, [string]>(`
      SELECT value
      FROM app_metadata
      WHERE key = ?
    `)
    .get(ACTIVE_PROJECT_KEY);

  if (!metadata) {
    return null;
  }

  const row = getDatabase()
    .query<ProjectRow, [string]>(`
      SELECT
        project_id,
        name,
        local_path,
        created_at,
        last_opened_at
      FROM projects
      WHERE project_id = ?
    `)
    .get(metadata.value);

  return row ? mapProjectRow(row) : null;
}

export function closeActiveProject(): void {
  deleteMetadata(ACTIVE_PROJECT_KEY);
}

export function activateProject(projectId: string): RegisteredProject {
  const row = getDatabase()
    .query<ProjectRow, [string]>(`
      SELECT
        project_id,
        name,
        local_path,
        created_at,
        last_opened_at
      FROM projects
      WHERE project_id = ?
    `)
    .get(projectId);

  if (!row) {
    throw new ProjectServiceError(
      `Project "${projectId}" is not registered on this machine.`
    );
  }

  return openExistingProject(row.local_path);
}

export function openExistingProject(folderPath: string): RegisteredProject {
  const projectPath = normalizeProjectPath(folderPath);
  const manifestPath = manifestPathFor(projectPath);

  if (!existsSync(manifestPath)) {
    throw new ProjectServiceError(
      `No ${MANIFEST_FILE_NAME} was found in "${projectPath}".`
    );
  }

  const manifest = parseManifestFile(manifestPath);
  ensureStandardFolders(projectPath);

  return registerProject(projectPath, manifest);
}

export function forgetProject(projectId: string): void {
  const active = getActiveProjectRecord();

  if (active?.id === projectId) {
    closeActiveProject();
  }

  getDatabase()
    .query(`
      DELETE FROM projects
      WHERE project_id = ?
    `)
    .run(projectId);
}

export function createProject(input: {
  folderPath: string;
  name?: string;
  description?: string;
}): RegisteredProject {
  if (!input.folderPath.trim()) {
    throw new ProjectServiceError('Project folder is required.');
  }

  const projectPath = normalizeProjectPath(input.folderPath);
  mkdirSync(projectPath, { recursive: true });

  const manifestPath = manifestPathFor(projectPath);

  if (existsSync(manifestPath)) {
    throw new ProjectConflictError(
      `A Forge project already exists at "${projectPath}". Use Open Existing Project instead.`
    );
  }

  const projectName = input.name?.trim() || basename(projectPath);

  if (!projectName) {
    throw new ProjectServiceError('Project name is required.');
  }

  ensureStandardFolders(projectPath);

  const manifest: ForgeProjectManifest = {
    schemaVersion: 1,
    project: {
      id: crypto.randomUUID(),
      name: projectName,
      description: input.description?.trim() || undefined
    },
    server: {
      name: projectName,
      version: '0.1.0',
      instructions: `Modern MCP Forge project: ${projectName}`
    },
    tools: [],
    resources: [],
    prompts: []
  };

  ForgeProjectManifestSchema.parse(manifest);
  writeJsonAtomic(manifestPath, manifest);

  return registerProject(projectPath, manifest);
}
