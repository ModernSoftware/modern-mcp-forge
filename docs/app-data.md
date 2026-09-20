# Application data

Modern MCP Forge separates portable project content from machine-local application state.

A Forge project is designed to be committed to source control:

```text
my-project/
├── forge.project.json
├── tools/
├── resources/
└── prompts/
```

The application database is machine-local and stores information such as:

- registered and recent project paths
- the active interactive project
- execution history
- application metadata

## Default database locations

Forge follows the operating system's per-user application-data conventions.

### Windows

```text
%LOCALAPPDATA%\ModernMCPForge\forge.db
```

If `LOCALAPPDATA` is unavailable, Forge falls back to:

```text
%USERPROFILE%\AppData\Local\ModernMCPForge\forge.db
```

### macOS

```text
~/Library/Application Support/ModernMCPForge/forge.db
```

### Linux

When `XDG_DATA_HOME` is defined:

```text
$XDG_DATA_HOME/modern-mcp-forge/forge.db
```

Otherwise:

```text
~/.local/share/modern-mcp-forge/forge.db
```

The Projects dashboard displays the resolved database location.

## Overrides

Use `MCP_FORGE_DATA_DIR` to override the application-data directory:

```bash
MCP_FORGE_DATA_DIR=/custom/application/data
```

Forge will store `forge.db` inside that directory.

Use `MCP_FORGE_DB_PATH` to select the database file directly:

```bash
MCP_FORGE_DB_PATH=/custom/location/forge.db
```

`MCP_FORGE_DB_PATH` takes precedence over `MCP_FORGE_DATA_DIR`.

## Source control

The application database should not be committed to the Modern MCP Forge repository or to a Forge project repository.

Only the project manifest and project content are portable. Project registration, recent-project state, and execution history belong to the local Forge installation.
