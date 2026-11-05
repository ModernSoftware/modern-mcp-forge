# Legacy project compatibility

Forge 0.10.0 creates native MCPack capabilities by default. Older projects may
still contain top-level `tools`, `resources` and `prompts` in `forge.project.json`.
The workspace identifies these as legacy and links to their existing editors.
They remain executable; they are not unused code to remove during release cleanup.

## Classic execution boundary

Classic Bun/Node/Python tools run through the Forge Tool ABI: a tool subprocess
reads a JSON request from stdin and writes one JSON response. This differs from
MCP stdio and from persistent MCPack workers. The implementation and limits are
in [protocol.ts](../src/lib/server/execution/protocol.ts) and
[process-runner.ts](../src/lib/server/execution/process-runner.ts).

Legacy resources read project files and prompts use stored templates. The legacy
`.NET` runtime value is reserved and reports not implemented; it is not .NET
worker support. Native sources support Node/Python, not native Bun/.NET/Go workers.

## Migrate deliberately

1. Back up the project and record behavior with representative inputs.
2. Create a native source and matching capability schema.
3. Move reusable business logic into modules, then adapt it to MCPack's
   `createWorker` or `create_worker` factory and MCP result shapes.
4. Test success, validation and business failures. Temporarily use a distinct
   name to avoid collisions with the enabled legacy definition.
5. Disable the legacy definition, assign the intended native name, and reconnect
   clients. Remove legacy entries/files only after checking their dependencies.
6. Export the native source and test it independently.

There is no automatic migration. Attaching old files does not convert their ABI.
Named cases target source-backed native/bridge/external tools. Native export
excludes classic definitions. The retired `/mcpack` preview redirects to Projects;
its API returns 410 so older callers get an explicit retirement signal.
