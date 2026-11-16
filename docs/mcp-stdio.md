# MCP stdio transport

An MCP client can launch Forge for one explicit project without using the web UI.
The same project server exposes native, bridged, external and retained classic
capabilities through HTTP and stdio. Each stdio process owns its project sources;
it does not reuse the processes running in an interactive web session.

## Configure a client

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

Use absolute paths appropriate for your OS. `--project` can name the directory or
its `forge.project.json`. The client process must have the configured environment
variables and required runtimes. The launcher is supplied in a source checkout;
the web Docker image does not include this TypeScript launcher.

Starting a second session can initialize another copy of your application and
its resources. Do not assume shared in-memory state between UI and stdio sessions.
Use durable storage where appropriate.

## Protocol and smoke checks

Stdout is reserved for MCP messages; send application diagnostics to stderr.
MCP stdio framing differs from the legacy Forge Tool ABI. A plain CLI script
that prints JSON once is not automatically an MCP stdio server.

```sh
bun run mcp:stdio:smoke -- --project /path/to/forge-project
```

The check verifies discovery using modern and classic negotiation paths. An
empty project is valid. Missing/invalid projects fail with diagnostics on stderr.
For the interactive web endpoint, copy the workspace's Streamable HTTP URL.
For deployment without Forge, see the exported pack's `start:stdio` command in
[native deployment](native-deployment.md).
