import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';

const APP_DIRECTORY_WINDOWS = 'ModernMCPForge';
const APP_DIRECTORY_MACOS = 'ModernMCPForge';
const APP_DIRECTORY_LINUX = 'modern-mcp-forge';

/**
 * Resolve the directory used for machine-local Modern MCP Forge state.
 *
 * This directory is deliberately outside any Forge project and outside the
 * Modern MCP Forge source repository.
 *
 * Override the directory with MCP_FORGE_DATA_DIR when a custom installation
 * layout is required.
 */
export function resolveForgeDataDirectory(): string {
  const explicitDirectory = process.env.MCP_FORGE_DATA_DIR?.trim();

  if (explicitDirectory) {
    return resolve(explicitDirectory);
  }

  switch (platform()) {
    case 'win32': {
      const localAppData = process.env.LOCALAPPDATA?.trim();

      if (localAppData) {
        return join(localAppData, APP_DIRECTORY_WINDOWS);
      }

      return join(homedir(), 'AppData', 'Local', APP_DIRECTORY_WINDOWS);
    }

    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', APP_DIRECTORY_MACOS);

    default: {
      const xdgDataHome = process.env.XDG_DATA_HOME?.trim();

      const baseDirectory =
        xdgDataHome
          ? resolve(xdgDataHome)
          : join(homedir(), '.local', 'share');

      return join(baseDirectory, APP_DIRECTORY_LINUX);
    }
  }
}

export function resolveDefaultDatabasePath(): string {
  return join(resolveForgeDataDirectory(), 'forge.db');
}
