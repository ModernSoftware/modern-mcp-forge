import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs';

import {
  checkDatabase,
  closeDatabase,
  getDatabase,
  resolveDatabasePath
} from '$lib/server/database';

import {
  activateProject,
  closeActiveProject,
  createProject,
  forgetProject,
  getActiveProjectRecord,
  listProjects,
  openExistingProject,
  ProjectConflictError,
  ProjectServiceError
} from '$lib/server/projects/project-service';

import {
  createManifest,
  createTempDirectory,
  removeTempDirectory,
  writeProject
} from '../helpers/project';

let sandbox: string;
let dbPath: string;

beforeEach(() => {
  closeDatabase();
  sandbox = createTempDirectory('modern-mcp-forge-project-service-');
  dbPath = join(sandbox, 'state', 'forge.db');
  process.env.MCP_FORGE_DB_PATH = dbPath;
});

afterEach(() => {
  closeDatabase();
  delete process.env.MCP_FORGE_DB_PATH;
  removeTempDirectory(sandbox);
});

describe('database initialization', () => {
  test('uses MCP_FORGE_DB_PATH and initializes the schema', () => {
    expect(resolveDatabasePath()).toBe(dbPath);
    expect(checkDatabase()).toBe(true);
    expect(existsSync(dbPath)).toBe(true);

    const tables = getDatabase()
      .query<{ name: string }, []>(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
      `)
      .all()
      .map((row) => row.name);

    expect(tables).toContain('app_metadata');
    expect(tables).toContain('projects');
    expect(tables).toContain('tool_executions');
  });

  test('stores schema version metadata', () => {
    const row = getDatabase()
      .query<{ value: string }, []>(`
        SELECT value
        FROM app_metadata
        WHERE key = 'schema_version'
      `)
      .get();

    expect(row?.value).toBe('1');
  });

  test('can close and reopen the database', () => {
    const first = getDatabase();
    expect(checkDatabase()).toBe(true);
    closeDatabase();

    const second = getDatabase();
    expect(second).not.toBe(first);
    expect(checkDatabase()).toBe(true);
  });
});

describe('project service', () => {
  test('creates a new project and standard folders', () => {
    const projectPath = join(sandbox, 'customer-mcp');
    const project = createProject({
      folderPath: projectPath,
      name: 'Customer MCP',
      description: 'Customer tools'
    });

    expect(project.name).toBe('Customer MCP');
    expect(project.available).toBe(true);
    expect(existsSync(join(projectPath, 'forge.project.json'))).toBe(true);
    expect(existsSync(join(projectPath, 'tools'))).toBe(true);
    expect(existsSync(join(projectPath, 'resources'))).toBe(true);
    expect(existsSync(join(projectPath, 'prompts'))).toBe(true);

    const manifest = JSON.parse(
      readFileSync(join(projectPath, 'forge.project.json'), 'utf8')
    );

    expect(manifest.project.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(manifest.tools).toEqual([]);
    expect(manifest.resources).toEqual([]);
    expect(manifest.prompts).toEqual([]);
    expect(getActiveProjectRecord()?.id).toBe(project.id);
  });

  test('defaults the project name to the folder name', () => {
    const projectPath = join(sandbox, 'folder-name');
    const project = createProject({ folderPath: projectPath });

    expect(project.name).toBe('folder-name');
  });

  test('rejects an empty project folder', () => {
    expect(() => createProject({ folderPath: '   ' })).toThrow(ProjectServiceError);
  });

  test('rejects creating a project over an existing Forge project', () => {
    const projectPath = join(sandbox, 'existing');
    createProject({ folderPath: projectPath });

    expect(() => createProject({ folderPath: projectPath })).toThrow(ProjectConflictError);
  });

  test('opens an existing project and registers it locally', () => {
    const projectPath = join(sandbox, 'existing');
    const manifest = createManifest({ name: 'Existing Project' });
    writeProject(projectPath, manifest);

    const project = openExistingProject(projectPath);

    expect(project.id).toBe(manifest.project.id);
    expect(project.name).toBe('Existing Project');
    expect(listProjects()).toHaveLength(1);
    expect(getActiveProjectRecord()?.id).toBe(manifest.project.id);
  });

  test('rejects opening a folder without forge.project.json', () => {
    const projectPath = join(sandbox, 'plain-folder');
    writeFileSync(join(sandbox, 'placeholder.txt'), 'x');

    expect(() => openExistingProject(projectPath)).toThrow(ProjectServiceError);
  });

  test('rejects an existing project with invalid JSON', () => {
    const projectPath = join(sandbox, 'invalid-json');
    const manifestPath = writeProject(projectPath);
    writeFileSync(manifestPath, '{ broken', 'utf8');

    expect(() => openExistingProject(projectPath)).toThrow(ProjectServiceError);
  });

  test('rejects an existing project without a project id', () => {
    const projectPath = join(sandbox, 'missing-id');
    const manifest = createManifest();
    const invalid = {
      ...manifest,
      project: {
        name: manifest.project.name
      }
    };

    writeProject(projectPath);
    writeFileSync(
      join(projectPath, 'forge.project.json'),
      JSON.stringify(invalid),
      'utf8'
    );

    expect(() => openExistingProject(projectPath)).toThrow(ProjectServiceError);
  });

  test('closes and reactivates a registered project', () => {
    const project = createProject({
      folderPath: join(sandbox, 'project')
    });

    closeActiveProject();
    expect(getActiveProjectRecord()).toBeNull();

    const activated = activateProject(project.id);
    expect(activated.id).toBe(project.id);
    expect(getActiveProjectRecord()?.id).toBe(project.id);
  });

  test('rejects activation of an unknown project id', () => {
    expect(() => activateProject(crypto.randomUUID())).toThrow(ProjectServiceError);
  });

  test('forgets a project without deleting its files', () => {
    const projectPath = join(sandbox, 'project');
    const project = createProject({ folderPath: projectPath });

    forgetProject(project.id);

    expect(listProjects()).toHaveLength(0);
    expect(getActiveProjectRecord()).toBeNull();
    expect(existsSync(join(projectPath, 'forge.project.json'))).toBe(true);
  });

  test('marks a recent project missing when its folder is renamed and available after restoration', () => {
    const projectPath = join(sandbox, 'project');
    const renamedPath = join(sandbox, 'project-renamed');
    createProject({ folderPath: projectPath });

    renameSync(projectPath, renamedPath);
    expect(listProjects()[0].available).toBe(false);

    renameSync(renamedPath, projectPath);
    expect(listProjects()[0].available).toBe(true);
  });

  test('updates the local path when the same project id is opened from a new location', () => {
    const firstPath = join(sandbox, 'first');
    const secondPath = join(sandbox, 'second');
    const manifest = createManifest({ name: 'Portable Project' });

    writeProject(firstPath, manifest);
    openExistingProject(firstPath);

    writeProject(secondPath, manifest);
    const reopened = openExistingProject(secondPath);

    expect(reopened.path).toBe(secondPath);
    expect(listProjects()).toHaveLength(1);
    expect(listProjects()[0].path).toBe(secondPath);
  });
});
