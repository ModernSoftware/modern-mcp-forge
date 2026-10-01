# Project sources: lifecycle foundation

Step 2 of the v0.10.0 integration adds persisted source definitions and runtime
ownership to regular Forge projects. It does not yet add source authoring controls,
merge source catalogs into `/mcp`, or replace classic handlers. The native preview
continues to work. Native UI and combined-endpoint integration are subsequent steps.

## Configuration

`forge.project.json` accepts an optional `sources` array. Projects without it retain
their existing behavior. Classic manifest authoring preserves source definitions.

```json
{
  "sources": [
    { "id": "orders", "kind": "native", "manifest": "native/mcpack.json", "enabled": true }
  ]
}
```

This is a fragment of the Forge manifest. `native/mcpack.json` is a standalone
MCPack manifest, owning its worker and capability definitions. Forge does not copy
or rewrite the source's tool schemas. IDs must be unique within the project; up to
32 descriptors are accepted. This is an admission bound, not a sizing recommendation.
Native manifest paths must resolve inside the project, including symlinks. Opening
a configured project executes its trusted local handlers; processes are not sandboxes.

Reserved descriptors for later adapters:

```json
[
  {
    "id": "custom",
    "kind": "bridge",
    "runtime": "python",
    "entrypoint": "bridges/custom.py",
    "enabled": false
  },
  { "id": "remote", "kind": "external", "url": "https://example.com/mcp", "enabled": false }
]
```

Bridge and external descriptors **must stay disabled**. They neither execute code
nor connect to URLs. Enabling them is rejected. Authentication, bridge dispatch,
and connection options will be specified with those implementations. External URL
credentials, query strings and fragments are rejected at this stage.

## Ownership and failure behavior

Each enabled native source owns a separate MCPack CLI process and worker set.
Catalogs remain keyed by source ID, so identical upstream names can coexist
internally. Public collision and alias rules belong to the combined endpoint slice.

The adapter contract covers start, discovery, invocation with cancellation, health,
and close. The project owner serializes open/close/reload. Reload is a full restart
and rediscovery; it does not preserve worker memory or replay operations. Calls
carry project identity and generation, and obsolete results are rejected after a
transition. A side effect may already have occurred: rejection does not authorize
retrying a write.

Create/open/activate starts configured sources. Switching projects, closing,
forgetting the active project, and selecting the standalone native preview close
the old sources. Partial startup rolls back all started adapters and clears their
catalogs. A cleanup failure retains failed owners for retry and prevents invocation.

The owner survives Vite module reloads. After a Forge process restart, remembered
SQLite selection alone does not execute source code: reopen the project or reload
sources explicitly. Native children use the existing stdio lifecycle and parent
pipe closure on host exit.

## Inspect and reload

The local management API uses Forge's Host/Origin checks and active-project guard:

- `GET /api/project/sources`: runtime project ID, generation, status, source health,
  catalogs and startup errors. It never launches code.
- `POST /api/project/sources` with `{"action":"reload","projectId":"..."}`:
  reread the selected project's manifest and restart its sources. Stale IDs return
  409; source startup failures return 503 with status details.

The normal project-selection response remains unchanged. Inspect source status
separately when activating a project whose handlers may fail. There is no source
invocation or source-editing HTTP endpoint in this slice. Edit the Forge manifest
on disk and reload until the native authoring UI is implemented.

## Validation

Tests cover legacy manifests, invalid and duplicate definitions, disabled adapters,
startup rollback, retryable cleanup failures, concurrent transitions, cancellation
signal forwarding, stale results, isolated Node/Python workers, symlink boundaries,
manifest-authoring preservation and real HTTP project transitions. Existing classic
and native-preview tests continue to run. This work targets `v0.10.0`, not `main`.
