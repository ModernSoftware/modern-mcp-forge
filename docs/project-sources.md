# Project source reference

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
External descriptors support Streamable HTTP and optional bearer credentials
through an environment-variable reference; see [External sources](external-sources.md).
External URL credentials, query strings and fragments are rejected.
The disabled external example above can be enabled when its server is available.

## Ownership and failure behavior

Each enabled native source owns a separate MCPack CLI process and worker set.
Catalogs remain keyed by source ID, so identical upstream names can coexist
internally. Native/classic conflicts in tool/prompt names, resource names and URIs are rejected.
Bridged and external connections can prefix every name or only collisions. Resource URIs always identify the owning connection. The connection definition supports per-item aliases and visibility.

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
tests and native HTTP integration tests continue to run.

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

See [agent exposure](agent-exposure.md) for persisted rules, public aliases,
visibility, routing and collision handling.

### Named tool cases

See [named test cases](named-test-cases.md) for definitions, exact assertions,
expected failures, batches, schema drift and persistence.
