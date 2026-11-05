# Native MCPack integration

Forge 0.10.0 uses `@modern-software/mcpack@0.9.0` from its frozen lockfile. No
MCPack checkout, npm token or separate setup is required for ordinary use.
Install Forge normally, then follow [native authoring](native-authoring.md) or
the [developer guide](developer-guide.md).

## Runtime architecture

Forge runs under Bun and launches MCPack's installed CLI explicitly with Node.
Each native source owns an MCPack host and its persistent Node/Python workers.
The integration uses MCP rather than loading Node's worker runtime into Bun.
This is distinct from a bridge adapter connecting an existing application.

The source manifest is standalone MCPack. The same handlers run outside Forge:

```sh
node node_modules/@modern-software/mcpack/dist/cli.js validate /path/to/mcpack.json
node node_modules/@modern-software/mcpack/dist/cli.js serve /path/to/mcpack.json
```

The second command serves stdio and waits for a client. Add `--transport http
--port 3000` for HTTP. For portable deployment use [native export](native-deployment.md).
Node 22+ is required; Python 3.11+ is needed for Python workers. Application code
may impose stricter runtime requirements.

## Lifecycle and editing

One interactive project is active at a time. Open starts its configured sources;
switch/close stops the previous sources. Saving implementation files or reloading
restarts enabled sources, discards memory and rediscovers capabilities. No
in-flight writes are retried. Failed startup leaves saved files editable.
Forge observes MCPack's worker shutdown budgets before force-stopping a host.

The editor handles manifests and existing declared worker modules inside their
source folder, including symlink checks. Files have a 256 KiB editor limit and
revision protection. Use your IDE for helper files, dependency changes and
TypeScript compilation. Point workers at executable JavaScript/Python.
Native tool calls join [execution history](app-data.md); source diagnostics retain
bounded stderr. Worker listings are configuration, not individual-worker telemetry.

Management access is local. Workers execute trusted code and are not sandboxed.
The MCPack manifest controls environment forwarding to workers. Native source
capabilities are tools, static resources and prompts. Broader relay features
have the limits described in [external sources](external-sources.md).

## Maintainer override

To test an unreleased local MCPack checkout, use:

```sh
bun run mcpack:setup -- ../mcpack
```

The script builds/packs that checkout and prints a CLI path. Set
`FORGE_MCPACK_CLI` to that absolute path in the environment launching Forge, then
run `bun run test:mcpack`. See [environment setup](external-sources.md#set-a-bearer-token)
for shell-specific assignment patterns, substituting the CLI variable and path.

The override is process configuration, not a browser setting. It can include
uncommitted MCPack code. Use a clean pinned revision for reproducible tests.
An old `.mcpack-runtime` folder alone does not select it. Unset the override to
return to the registry dependency; verify the published package for release.

## Verification

`bun run test:mcpack` checks native discovery/result parity, persistent state,
editing/conflicts, restart/recovery, shutdown and HTTP behavior. CI runs it on
Windows, Linux and macOS. The dedicated command fails if the package CLI cannot
be found rather than silently skipping native verification.
