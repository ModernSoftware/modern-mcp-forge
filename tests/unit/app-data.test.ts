import { afterEach, describe, expect, test } from 'bun:test';
import { basename, resolve } from 'node:path';
import { resolveDatabasePath } from '$lib/server/database';

import {
  resolveDefaultDatabasePath,
  resolveForgeDataDirectory
} from '$lib/server/app-data';

const originalDataDir = process.env.MCP_FORGE_DATA_DIR;
const originalDbPath = process.env.MCP_FORGE_DB_PATH;

afterEach(() => {
  if (originalDataDir === undefined) {
    delete process.env.MCP_FORGE_DATA_DIR;
  } else {
    process.env.MCP_FORGE_DATA_DIR = originalDataDir;
  }

  if (originalDbPath === undefined) {
    delete process.env.MCP_FORGE_DB_PATH;
  } else {
    process.env.MCP_FORGE_DB_PATH = originalDbPath;
  }
});

describe('application data paths', () => {
  test('MCP_FORGE_DATA_DIR overrides the platform default', () => {
    process.env.MCP_FORGE_DATA_DIR = './custom-forge-data';

    expect(resolveForgeDataDirectory()).toBe(resolve('./custom-forge-data'));
    expect(resolveDefaultDatabasePath()).toBe(
      resolve('./custom-forge-data/forge.db')
    );
  });

  test('MCP_FORGE_DB_PATH overrides the default database file', () => {
    process.env.MCP_FORGE_DB_PATH = './custom-db/test.db';

    expect(resolveDatabasePath()).toBe(resolve('./custom-db/test.db'));
  });

  test('database override wins over application-data override', () => {
    process.env.MCP_FORGE_DATA_DIR = './custom-forge-data';
    process.env.MCP_FORGE_DB_PATH = './other/forge.sqlite';

    expect(resolveDatabasePath()).toBe(resolve('./other/forge.sqlite'));
  });

  test('default database file is named forge.db', () => {
    delete process.env.MCP_FORGE_DATA_DIR;
    delete process.env.MCP_FORGE_DB_PATH;

    expect(basename(resolveDefaultDatabasePath())).toBe('forge.db');
  });
});
