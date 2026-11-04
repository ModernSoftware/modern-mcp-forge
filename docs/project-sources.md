# Project sources: lifecycle foundation

Project sources provide persisted definitions and runtime ownership for regular
Forge projects. Native authoring and combined classic/native HTTP exposure are
available; see [Native authoring](native-authoring.md). The unified workspace replaces the standalone preview.

## Configuration

`forge.project.json` accepts an optional `sources` array. Projects without it retain
their existing behavior. Classic manifest authoring preserves source definitions.

```json
{
  "sources": [
    {
      "id": "orders",
      "kind": "native",
      "manifest": "native/mcpack.json",
      "enabled": true
    }
  ]
}
```

This is a fragment of the Forge manifest. `native/mcpack.json` is a standalone
MCPack manifest, owning its worker and capability definitions. Forge does not copy
or rewrite the source's tool schemas. IDs must be unique within the project; up to
32 descriptors are accepted. This is an admission bound, not a sizing recommendation.
Native manifest paths must resolve inside the project, including symlinks. Opening
a configured project executes its trusted local handlers; processes are not sandboxes.

Example disabled connections:

```json
[
  {
    "id": "custom",
    "kind": "bridge",
    "runtime": "python",
    "entrypoint": "bridges/custom.py",
    "enabled": false
  },
  {
    "id": "remote",
    "kind": "external",
    "url": "https://example.com/mcp",
    "enabled": false
  }
]
```

Node and Python bridges run a project-owned adapter with Forge’s host when mode is `adapter`. Earlier descriptors launch their existing stdio script. See [Local bridges](bridged-sources.md) for setup, environment forwarding and lifecycle.
External descriptors now support Streamable HTTP and optional bearer credentials
through an environment-variable reference; see [External sources](external-sources.md).
External URL credentials, query strings and fragments are rejected.
The disabled external example above can be enabled when its server is available.

## Ownership and failure behavior

Each enabled native source owns a separate MCPack CLI process and worker set.
Catalogs remain keyed by source ID, so identical upstream names can coexist
internally. The combined endpoint rejects duplicate tool/prompt names, resource names and URIs.
External connections can prefix every name or only collisions. Resource URIs always identify the owning connection. The connection definition supports per-item aliases and visibility.

The adapter contract covers start, discovery, invocation with cancellation, health,
and close. The project owner serializes open/close/reload. Reload is a full restart
and rediscovery; it does not preserve worker memory or replay operations. Calls
carry project identity and generation, and obsolete results are rejected after a
transition. A side effect may already have occurred: rejection does not authorize
retrying a write.

Create/open/activate starts configured sources. Switching projects, closing,
forgetting the active project close the old sources. A native startup failure rolls back started adapters and clears their catalogs. An unavailable external connection is reported on its own source and excluded from discovery. Healthy native and external sources can still serve requests. A cleanup failure retains failed owners for retry and prevents invocation.

The owner survives Vite module reloads. After a Forge process restart, remembered
SQLite selection alone does not execute source code. Choose **Continue** on the
Projects screen to start its enabled sources. An existing workspace or source
tab remembers which project it was using. Reloading that tab resumes the same
active project, shows startup progress, and rediscovers its catalogs. Concurrent
tabs share one startup. A fresh tab without this history offers **Start project
sources**. Continuing a running project reuses its workers. Native children use
the existing stdio lifecycle and parent pipe closure on host exit.

## Inspect and reload

The local management API uses Forge's Host/Origin checks and active-project guard:

- `GET /api/project/sources`: runtime project ID, generation, status, source health,
  catalogs and startup errors. It never launches code.
- `POST /api/project/sources` with `{"action":"reload","projectId":"..."}`:
  reread the selected project's manifest and restart its sources. Stale IDs return
  409; source startup failures return 503 with status details.

The normal project-selection response remains unchanged. Inspect source status
separately when activating a project whose handlers may fail. The guarded `POST /api/project/native` endpoint supports create/attach,
enable/disable/detach, file read/save and source-specific invocation. Mutations and
calls include project identity and generation; saves also require a file revision.

## Validation

Tests cover legacy manifests, invalid and duplicate definitions, disabled adapters,
startup rollback, retryable cleanup failures, concurrent transitions, cancellation
signal forwarding, stale results, isolated Node/Python workers, symlink boundaries,
manifest-authoring preservation and real HTTP project transitions. Existing classic
tests and native HTTP integration tests continue to run. This work targets `v0.10.0`, not `main`.

## Capability exposure

A native source may include `disabledCapabilities`, for example:

```json
"disabledCapabilities": [{ "kind": "tools", "name": "lookup_order" }]
```

These are Forge exposure settings, separate from the MCPack manifest. Disabling a
capability filters discovery and rejects direct invocation through Forge. It does
not stop a worker shared by other capabilities. Reconnect clients after changing
exposure. The [native export](native-deployment.md) applies these selections to a copy of the pack manifest.

### Bridged and external sources

Open **Manage bridge** or **Manage connection**. Under **Discovered catalog**, expand
**Agent exposure** on a tool, static resource or prompt. Save a public alias or a
local description, or clear **Expose to agents**. Reconnect your agent after saving.
The local tester keeps the original names and schemas, including hidden items.
A resource alias changes the display name. Calls still use its source-scoped URI.

Forge stores rules in the source’s `exposure` array in `forge.project.json`.
Rules identify the upstream tool or prompt by its exact original name and a
resource by its original URI. If upstream renames or removes it, the definition
shows a rule to review. Restore defaults to remove a rule. A conflicting fixed
alias is rejected before the project file is written.

### Named tool cases

1. Open the tool’s **Test** or **Inspect & test** view. Enter fixture arguments
   and run it once if you want to capture an expected value.
2. Open **Named test cases → Save as case**. Name it and review its saved
   arguments. For a successful result or an expected MCP tool error, use
   **Use value from last result** to capture a JSON Pointer such as
   `/structuredContent/total` or `/content/0/text`. An empty path captures
   the whole response. For an invalid-input case, enter the expected validation
   path, such as `/quantity`. Forge checks this locally without calling the tool.
3. Select one or more cases, then choose **Run selected** to compare the results.
   **Select all visible** selects the runnable cases matching the current
   filters; cases hidden by filters are not run. **Deselect all** clears every
   selection. A batch that dispatches requests asks for confirmation once.
   Cases run sequentially in list order. **Stop after current case** stops the
   queue without interrupting the current tool call. Check the expected and
   actual values inside a failed row.
   A transport or authentication failure fails the case even if it expects
   a tool error.
4. Open **Workspace → Named test cases** after reopening the project to see
   the latest verdict and timestamp for each case. Search by case, tool or source,
   or filter by source type, individual source and result. Filters are remembered
   per project in the current browser tab. If an input schema changes,
   open the tester, review the saved arguments and assertions, then save the
   case again. A missing tool remains listed for review.

Commit `forge.cases.json` alongside `forge.project.json` to share the definitions.
Use synthetic inputs and expected values. Keep credentials in the source’s
configured environment variables. Verdicts live in machine-local SQLite.
Native export excludes the case file.
