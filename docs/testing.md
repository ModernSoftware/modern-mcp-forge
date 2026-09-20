# Testing Modern MCP Forge

Modern MCP Forge uses Bun's built-in test runner. No additional test framework is required.

The test suite is intentionally layered so failures are easier to diagnose:

```text
check / build
    Svelte + TypeScript compilation

unit
    schemas, validation, path handling, source services, manifest behavior

integration
    SQLite, project lifecycle, execution history, child processes, generated starters

e2e
    real Vite HTTP server + real MCP clients
    real MCP stdio child process + modern/classic clients
```

## Commands

Run the fast automated suite:

```bash
bun run test
```

Run one layer:

```bash
bun run test:unit
bun run test:integration
bun run test:e2e
```

Generate Bun coverage for unit and integration tests:

```bash
bun run test:coverage
```

Run the release-oriented local verification sequence:

```bash
bun run test:all
```

`test:all` runs:

```text
bun run check
bun run test
bun run test:e2e
bun run build
```

The tests are forced to one test concurrency because several integration tests intentionally manipulate process-scoped Forge state such as the selected project and temporary database path. This keeps the suite deterministic on Windows, Linux, and macOS.

## What is covered

### Project and manifest model

- mandatory stable UUID project identity
- manifest defaults and schema rejection
- Bun / Node / Python / reserved .NET runtime definitions
- flat tool arguments
- advanced nested JSON Schema
- project create/open/close/activate/forget
- recent-project availability when a checkout disappears and returns
- project relocation with stable project ID
- duplicate project protection
- invalid and missing manifests
- standard project-folder bootstrapping

### Definition lifecycle

- Tool / Resource / Prompt creation
- duplicate names
- duplicate resource URIs
- invalid names and URIs
- edit/update
- immutable tool name
- immutable tool runtime
- enable / disable
- delete
- concurrent manifest writes

### Source authoring

- Tool source discovery
- Resource file discovery
- Prompt template discovery
- ignored build/dependency directories
- project-relative and external source detection
- starter generation for Bun, Node, and Python
- starter execution through Forge Tool ABI
- source create/read/save/conflict behavior
- Resource 8 MB text limit
- Prompt 1 MB text limit
- prompt interpolation behavior

### Execution

- Forge Tool ABI success and error schemas
- Bun child execution
- Node child execution when Node is available
- Python child execution when Python is available
- child working directory
- execution environment variables
- stderr capture
- non-zero exit codes
- empty stdout
- invalid JSON stdout
- ABI-invalid JSON
- explicit ABI error responses
- execution timeouts
- .NET not-implemented behavior
- successful and failed execution history
- history isolation per project
- execution statistics

### MCP

- field-based Zod input schemas
- nested JSON Schema conversion
- Prompt argument schemas
- enabled capability filtering
- Streamable HTTP transport
- stdio transport
- modern protocol negotiation
- classic/legacy initialization
- Tool calls
- Resource reads
- Prompt rendering
- disabled definitions not advertised
- stdio launch failures keep stdout protocol-clean

### HTTP application behavior

The E2E HTTP test starts a real Vite development server on a temporary port and exercises:

- health endpoint
- no-project MCP 503 state
- no-project project status
- loopback/origin guard
- server-backed directory creation
- invalid and duplicate directory handling
- project creation and duplicate protection
- Tool/Resource/Prompt authoring APIs
- source starter creation APIs
- direct Tool execution API
- MCP Streamable HTTP client
- runtime-change rejection
- disable/re-enable lifecycle
- source-preserving definition deletion
- project close
- project-page redirect while closed
- project reopen

## Environment-dependent tests

Node and Python execution tests detect whether their runtime is present.

- Bun tests always run because Forge itself is running under Bun.
- Node-specific execution assertions run when `node` is on PATH.
- Python-specific execution assertions run when `python`, `python3`, or `py` is available.

The GitHub Actions verification matrix installs Node.js and Python on Windows,
Ubuntu, and macOS so those supported runtime branches execute on every CI
platform. See [Continuous integration](ci.md).

## What automated tests intentionally do not replace

The following still need a manual test pass before 0.9.0:

- visual layout and responsive behavior
- Monaco keyboard/editor ergonomics
- light/dark theme appearance
- native filesystem browsing experience on each OS
- very large real-world projects
- unusual permission-denied filesystem locations
- third-party MCP hosts/IDEs beyond the SDK clients used here
- long-running real tools and external APIs/databases

`bun run check` and `bun run build` provide compile-time coverage for all Svelte
components, while the manual pass covers browser UX. Track that final pass with
the [0.9.0 release checklist](release-checklist.md).

## Test isolation

Every filesystem test uses an OS temporary directory and removes it afterward.

Database tests use `MCP_FORGE_DB_PATH` pointing at a temporary SQLite file. They never use or modify the developer's normal Modern MCP Forge application database.

The E2E HTTP server also gets its own temporary database and random available TCP port.
