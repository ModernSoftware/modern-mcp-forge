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
  {
    "id": "remote",
    "kind": "external",
    "url": "https://example.com/mcp",
    "enabled": false
  }
]
```

Bridge descriptors **must stay disabled** until bridge dispatch is implemented.
External descriptors now support Streamable HTTP and optional bearer credentials
through an environment-variable reference; see [External sources](external-sources.md).
External URL credentials, query strings and fragments are rejected.
The disabled external example above can be enabled when its server is available.

## Ownership and failure behavior

Each enabled native source owns a separate MCPack CLI process and worker set.
Catalogs remain keyed by source ID, so identical upstream names can coexist
internally. The combined endpoint rejects duplicate tool/prompt names, resource names and URIs.
External capability names and URIs are automatically namespaced by connection ID.
Explicit aliases are future work.

The adapter contract covers start, discovery, invocation with cancellation, health,
and close. The project owner serializes open/close/reload. Reload is a full restart
and rediscovery; it does not preserve worker memory or replay operations. Calls
carry project identity and generation, and obsolete results are rejected after a
transition. A side effect may already have occurred: rejection does not authorize
retrying a write.

Create/open/activate starts configured sources. Switching projects, closing,
forgetting the active project close the old sources. Partial startup rolls back all started adapters and clears their
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
exposure. Deployment/export semantics will be handled in the native export slice.
