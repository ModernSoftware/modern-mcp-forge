# Native MCPack integration (v0.10.0 preview)

Forge can open an existing native MCPack project, edit its manifest and worker modules in Monaco, test its tools/resources/prompts, and expose them to an agent through Forge's `/mcp` endpoint. The same files run independently with the MCPack CLI.

## Install the published dependency

Forge pins `@modern-software/mcpack@0.1.0-alpha.1` in package.json and bun.lock.
Install Forge normally; no MCPack checkout, npm token, or separate setup step is needed:

```sh
git switch v0.10.0
bun install --frozen-lockfile
bun run test:mcpack
bun run dev
```

Requires Bun per Forge's package.json and Node.js 22+. Python 3.11+ is needed only for
projects with Python workers. Forge resolves the installed package's CLI and launches
it with Node, while Forge itself continues to run under Bun. Runtime installation does
not happen when you open a project. Version upgrades go through a dependency/lockfile PR.

For a first project, copy the installed example into a folder you own. In Git Bash:

```sh
mkdir -p ../my-native-project
cp -R node_modules/@modern-software/mcpack/examples/hello/. ../my-native-project/
```

Do not edit files inside node_modules; reinstalling dependencies may replace them.

## Developing MCPack itself (optional)

The registry dependency is always the default, even if an old `.mcpack-runtime` folder
exists. To test a local MCPack checkout instead:

```sh
bun run mcpack:setup -- ../mcpack
# Git Bash; use the path printed by setup, with forward slashes on Windows:
export FORGE_MCPACK_CLI="$PWD/.mcpack-runtime/node_modules/@modern-software/mcpack/dist/cli.js"
bun run test:mcpack
bun run dev
```

`mcpack:setup` runs npm ci/pack in that checkout and installs the tarball into the ignored
`.mcpack-runtime` folder. It records the source/version/integrity in source.json. This
includes uncommitted source changes; use a clean pinned commit for reproducible checks.
Close the native project and rerun setup after changing MCPack. Project handler edits
do not require reinstalling MCPack. Unset `FORGE_MCPACK_CLI` to return to the npm dependency.
No browser request can change the CLI override.

## Try the workflow

1. Open **Native MCPack** in Forge's sidebar (`/mcpack`).
2. Enter the absolute path to a native manifest, for example `C:/repos/my-native-project/mcpack.json`.
3. Click **Open project**. Forge starts MCPack with Node, discovers its capabilities, and selects the native project for `/mcp`.
4. Select `greet` under Tools. Enter `{"name":"Diego"}` and click **Run**. Repeat: the count increases and the worker PID stays the same.
5. Test the guide resource and welcome prompt. **Source definition** shows the metadata and schemas discovered from MCPack unchanged.
6. Select `mcpack.json`, change the greeting in `workers.main.config`, and click **Save and restart**. Test again: the new greeting appears, with fresh worker state.
7. Connect an MCP agent to `http://localhost:5173/mcp`. Reconnect after changing capabilities or restarting.
8. Close the native project and run that **same manifest** independently:

```sh
node node_modules/@modern-software/mcpack/dist/cli.js serve ../my-native-project/mcpack.json
```

This command serves stdio and waits for an MCP client. Add `--transport http --port 3000`
for MCPack's standalone HTTP endpoint. Forge supplies its own development HTTP endpoint.

## Ownership and lifecycle

Forge remains a Bun application. It launches the MCPack CLI explicitly with Node; MCPack then manages its persistent Node/Python workers. This avoids running MCPack's `fork()` implementation under Bun's `process.execPath`.

The package runs the same native runtime in both standalone and Forge use. Forge uses the CLI's MCP interface for this first integration rather than importing the Node runtime directly into Bun. This is a native project adapter, not the general external-server/bridge feature planned for later.

Only one native project is selected per Forge process. Opening it closes the classic Forge project selection; opening/creating/activating a classic project closes native workers. Native selection is intentionally session-only: it is not restored automatically after restarting Forge and does not yet appear in the recent-project database.

Save and restart stops the old MCPack process, writes the actual file, starts a fresh server, and discovers the new catalog. It does not retain application state or retry in-flight writes. A failed startup remains visible and editable for recovery. The **Restart** button reloads edits made in your own IDE. The connection deadline includes MCPack's configured worker startup budget and time for cleanup. Forge waits for configured worker shutdown deadlines before force-stopping an unresponsive host.

Worker diagnostics show the last 16 KiB of stderr. Native operations currently display results in the workbench but are not added to the classic execution-history database. Diagnostics may contain application secrets; only use trusted local code.

## Editing and transport boundaries

The editor permits the manifest and existing declared worker modules inside the project root. It resolves symlinks, rejects escapes, limits files to 256 KiB, and rejects a stale save if another editor changed the file. Use your IDE for helper files, new modules, dependency changes, and TypeScript compilation; the manifest points to executable JavaScript.

Management and MCP endpoints retain Forge's loopback/Origin checks. This is local development access control, not production OAuth or per-tool authorization. Environment values reach the MCPack host; its manifest controls which values workers inherit. Child processes are not a sandbox.

The adapter exposes native tools, static resources and prompts only, matching the current MCPack contract. MCPack also supports Python workers and standalone HTTP/service-token authentication.
External MCP sources, language bridges, and media results remain outside this adapter.

## Verification

```sh
bun run check
bun run test
bun run test:e2e
bun run build
bun run test:mcpack
```

`test:mcpack` resolves the registry dependency unless an explicit CLI override is set.
It checks persistent calls, standalone protocol parity, editor conflict detection,
restart, error recovery, and the real HTTP endpoint. Forge CI installs from the frozen
lockfile and runs this suite on Windows, Linux, and macOS. The ordinary suites also discover the installed dependency; the dedicated command fails
if its CLI is missing instead of silently skipping native verification.

MCPack's own source regression workflow can still test unreleased changes against its
pinned Forge revision. When updating that pin to this integration, set FORGE_MCPACK_CLI
explicitly after the local setup step so the tests exercise the candidate checkout.
