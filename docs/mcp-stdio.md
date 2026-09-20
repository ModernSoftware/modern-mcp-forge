# MCP stdio transport

Modern MCP Forge exposes the same project capabilities through both Streamable HTTP and stdio.

```text
                    Forge MCP server factory
                    /       |       \
                 Tools  Resources  Prompts
                         |
              +----------+----------+
              |                     |
     Streamable HTTP             stdio
        /mcp                 child process
```

Both transports use the same `createForgeMcpServer()` factory. Tool, Resource, and Prompt definitions are not duplicated.

## Explicit project selection

The interactive web application keeps an active project in its local application state. A stdio process is different: an MCP host launches it for one specific project.

For that reason, stdio always requires an explicit project path:

```text
--project <path>
```

The stdio launcher selects that manifest for its own process before creating the MCP server. It does not depend on whichever project happens to be active in the web UI.

This also means multiple MCP hosts can launch different Forge projects independently.

## Start the stdio server

An MCP host should normally spawn the process directly:

```bash
bun /absolute/path/to/modern-mcp-forge/scripts/mcp-stdio.ts \
  --project /absolute/path/to/my-forge-project
```

The `--project` value may also point directly to `forge.project.json`.

A generic MCP host configuration is conceptually:

```json
{
  "mcpServers": {
    "customer-mcp": {
      "command": "bun",
      "args": [
        "/absolute/path/to/modern-mcp-forge/scripts/mcp-stdio.ts",
        "--project",
        "/absolute/path/to/customer-mcp"
      ]
    }
  }
}
```

## stdout and stderr

For MCP stdio:

```text
stdout = MCP protocol only
stderr = diagnostics and operational logging
```

Do not add ordinary startup logging to stdout in the stdio process.

This is separate from the Forge Tool ABI:

```text
MCP host
  <--- MCP stdio --->
Forge
  <--- Forge Tool ABI --->
Node / Python / Bun tool
```

Those are two independent protocol boundaries.

## Smoke test

Run:

```bash
bun run mcp:stdio:smoke -- --project /path/to/forge-project
```

The smoke test launches Forge the same way an MCP host does and checks capability discovery through both modern negotiated and classic initialization paths.

An empty Forge project is valid, so zero Tools, Resources, or Prompts is not considered a failure.

## Streamable HTTP remains supported

The web application continues to expose the currently active interactive project at:

```text
http://localhost:5173/mcp
```

stdio is an additional transport, not a replacement.
