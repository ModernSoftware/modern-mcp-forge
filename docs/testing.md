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

The end-to-end suite runs the Forge Python adapter against an existing FastMCP application. Before running it, install the fixture SDK:

```bash
python -m pip install "mcp==1.29.0"
python -c "import sys; from mcp.server.fastmcp import FastMCP; print(sys.executable)"
```

The test selects `python` from PATH, falling back to `python3`. If only `python3` is available, use it in both commands. Use the same terminal for installation and testing. Installing the standalone `fastmcp` package, or installing `mcp` into another interpreter, does not satisfy this fixture's prerequisite. Native Python workers do not require the MCP Python SDK.

The bridge test creates an adapter-local `.venv` with `--system-site-packages` and verifies imports before starting its MCP connection. This temporary environment inherits the base interpreter's system packages, not an activated parent virtual environment's packages. For this suite, deactivate that parent environment and install the fixture SDK in the selected base interpreter. A missing prerequisite now reports the interpreter and installation command directly. Windows may report that a temporary path's short (8.3) name resolves to its long name; that notice alone is not a test failure. Node uses the installed Forge SDK dependencies.

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
bun run check:docs
bun run check
bun run test
bun run test:e2e
bun run build
```

The tests are forced to one test concurrency because several integration tests intentionally manipulate process-scoped Forge state such as the selected project and temporary database path. This keeps the suite deterministic on Windows, Linux, and macOS.

Python handler-insertion cases start several interpreter processes and have a 60-second per-test budget for slower machines. Each individual parser process retains its own five-second limit. Run the normal commands above; no global timeout override is needed.

## What is covered

### Current source-backed workflows

- Native Node/Python authoring, lifecycle, revision conflicts and published MCPack parity.
- Node/Python bridge adapters, stdio entrypoints and application checkout isolation.
- External HTTP discovery, bearer environment references and failure isolation.
- Agent exposure aliases, descriptions, hidden direct-call rejection and schema identity.
- Saved cases, expected errors, exact assertions, schema drift and local verdict persistence.
- Form/JSON arguments, sample generation, result previews and batch explorer behavior.
- Clean native archive deployment and five-framework compatibility in separate suites.

### Classic compatibility and shared project model

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

The following still need a manual test pass before 0.10.0:

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
the [0.10.0 release checklist](release-checklist.md).

## Test isolation

Every filesystem test uses an OS temporary directory and removes it afterward.

Database tests use `MCP_FORGE_DB_PATH` pointing at a temporary SQLite file. They never use or modify the developer's normal Modern MCP Forge application database.

The E2E HTTP server also gets its own temporary database and random available TCP port.


## Additional release suites

`test:all` does not run coverage, published-runtime parity, browser, deployment or
the five-framework lab. Run the relevant commands explicitly or use CI:

```sh
bun run test:coverage
bun run test:mcpack
node examples/bridges/compatibility-lab/setup.mjs
bun test examples/bridges/compatibility-lab/tests/compatibility.test.mjs
bun run test:deployment
npm ci --prefix tests/browser
bun tests/browser/workspace-export.mjs
bun tests/browser/tool-arguments.mjs
```

Follow the [lab requirements](../examples/bridges/compatibility-lab/README.md)
before its setup. Browser checks need Chrome/Chromium (`CHROME_BIN` may specify
its executable). Set `FORGE_UI_SCREENSHOTS` to an output directory to capture
browser review images. The scripts create temporary synthetic projects and
clean them up. They use real local calls, not paid services or production tokens.

Saved user cases in `forge.cases.json` are a separate workbench feature; these
repository test commands do not discover/run them as a CI suite. See
[named test cases](named-test-cases.md) for their current boundaries.
