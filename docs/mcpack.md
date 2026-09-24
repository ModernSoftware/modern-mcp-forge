# Native MCPack integration (v0.10.0 preview)

Forge can open an existing native MCPack project, edit its manifest and worker modules in Monaco, test its tools/resources/prompts, and expose them to an agent through Forge's `/mcp` endpoint. The same files run independently with the MCPack CLI.

## Install without publishing MCPack

MCPack is currently private and unpublished. Forge does not depend on a moving Git branch, copy its source into the public repository, or require a registry token.

Use sibling checkouts, with your GitHub account's normal access to the private repository:

```sh
# If you do not already have MCPack locally:
git clone https://github.com/ModernSoftware/mcpack.git ../mcpack

# In an existing MCPack checkout, select the approved version first:
git -C ../mcpack switch main
git -C ../mcpack pull --ff-only

# In the Forge checkout:
git switch v0.10.0
bun install --frozen-lockfile
bun run mcpack:setup -- ../mcpack
bun run dev
```

Requires Bun per Forge's package.json, Node.js 22+, npm, and Git for obtaining the source. The first integration was verified against MCPack main commit `99609f5dd104baf447633ebe9cac419b397ea892`. Check out that commit in MCPack if you want to reproduce that exact source baseline.

`mcpack:setup` runs `npm ci` and `npm pack` in the selected MCPack checkout, then installs the tarball in Forge's ignored `.mcpack-runtime` directory. The package name/version, source path, and tarball integrity are recorded locally in `.mcpack-runtime/source.json`. The installation uses the contents of your checkout, including uncommitted source edits. Select a clean pinned commit for reproducible experiments. The original source checkout is still available for standalone testing.

Nothing is published. The temporary tarball is removed after installation. Re-run setup after changing MCPack itself, with the native project closed. Project handler edits do **not** require reinstalling MCPack.

Advanced alternative: set `FORGE_MCPACK_CLI` to an absolute path to a built MCPack `dist/cli.js`. That checkout must have its dependencies installed. No browser request can change the runtime executable or package location.

A Git URL dependency is unnecessary at this stage: it would require private repository access during every install and a source-build packaging contract. A registry package or versioned private artifact can replace the local installation later, once distribution and licensing are decided.

## Try the workflow

1. Open **Native MCPack** in Forge's sidebar (`/mcpack`).
2. Enter the absolute path to a native manifest, for example `C:/repos/mcpack/examples/hello/mcpack.json`.
3. Click **Open project**. Forge starts MCPack with Node, discovers its capabilities, and selects the native project for `/mcp`.
4. Select `greet` under Tools. Enter `{"name":"Diego"}` and click **Run**. Repeat: the count increases and the worker PID stays the same.
5. Test the guide resource and welcome prompt. **Source definition** shows the metadata and schemas discovered from MCPack unchanged.
6. Select `mcpack.json`, change the greeting in `workers.main.config`, and click **Save and restart**. Test again: the new greeting appears, with fresh worker state.
7. Connect an MCP agent to `http://localhost:5173/mcp`. Reconnect after changing capabilities or restarting.
8. Close the native project and run that **same manifest** independently:

```sh
node ../mcpack/dist/cli.js serve ../mcpack/examples/hello/mcpack.json
```

This standalone command serves stdio and waits for an MCP client. It does not create an HTTP listener. Forge supplies the development HTTP endpoint.

## Ownership and lifecycle

Forge remains a Bun application. It launches the MCPack CLI explicitly with Node; MCPack then manages its persistent Node workers. This avoids running MCPack's `fork()` implementation under Bun's `process.execPath`.

The package runs the same native runtime in both standalone and Forge use. Forge uses the CLI's MCP interface for this first integration rather than importing the Node runtime directly into Bun. This is a native project adapter, not the general external-server/bridge feature planned for later.

Only one native project is selected per Forge process. Opening it closes the classic Forge project selection; opening/creating/activating a classic project closes native workers. Native selection is intentionally session-only: it is not restored automatically after restarting Forge and does not yet appear in the recent-project database.

Save and restart stops the old MCPack process, writes the actual file, starts a fresh server, and discovers the new catalog. It does not retain application state or retry in-flight writes. A failed startup remains visible and editable for recovery. The **Restart** button reloads edits made in your own IDE. The connection deadline includes MCPack's configured worker startup budget and time for cleanup. Forge waits for configured worker shutdown deadlines before force-stopping an unresponsive host.

Worker diagnostics show the last 16 KiB of stderr. Native operations currently display results in the workbench but are not added to the classic execution-history database. Diagnostics may contain application secrets; only use trusted local code.

## Editing and transport boundaries

The editor permits the manifest and existing declared worker modules inside the project root. It resolves symlinks, rejects escapes, limits files to 256 KiB, and rejects a stale save if another editor changed the file. Use your IDE for helper files, new modules, dependency changes, and TypeScript compilation; the manifest points to executable JavaScript.

Management and MCP endpoints retain Forge's loopback/Origin checks. This is local development access control, not production OAuth or per-tool authorization. Environment values reach the MCPack host; its manifest controls which values workers inherit. Child processes are not a sandbox.

The adapter exposes native tools, static resources and prompts only, matching the current MCPack contract. It does not add external MCP sources, language bridges, Python workers, media results or production HTTP/auth support to MCPack.

## Verification

```sh
bun run check
bun run test
bun run test:e2e
bun run build
bun run test:mcpack
```

`test:mcpack` requires an installed MCPack runtime and fails clearly if it is missing. It checks persistent calls, standalone protocol parity, editor conflict detection, restart, error recovery, and the real HTTP endpoint. General Forge suites skip the three package-dependent tests when the private runtime is unavailable; existing Forge coverage still runs.

The separate integration workflow in the private MCPack repository checks out MCPack itself plus a pinned public Forge commit, installs the package locally, and runs `test:mcpack` on Windows, Linux, and macOS. This avoids introducing cross-repository private credentials into public Forge CI.
