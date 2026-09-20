# Continuous integration

Modern MCP Forge runs its release-oriented automated verification on all three
desktop operating-system families supported by the project:

```text
Ubuntu
Windows
macOS
```

The workflow lives at:

```text
.github/workflows/ci.yml
```

It runs for:

- pushes to `main`
- pull requests
- manual `workflow_dispatch` runs

## Runtime matrix

Each operating system installs:

```text
Bun      version from package.json
Node.js  22
Python   3.13
```

Bun is the application runtime. Node.js and Python are installed so their Tool
runtime integration tests execute rather than being skipped.

The reserved .NET runtime remains intentionally unimplemented in 0.9.0 and its
tests verify the current not-implemented behavior.

## Verification job

Each operating system runs these as separate CI steps:

```bash
bun install --frozen-lockfile
bun run runtime:check
bun run check
bun run test
bun run test:e2e
bun run build
```

They are intentionally separate instead of running only `bun run test:all` so a
GitHub Actions failure immediately identifies the failing layer.

The commands are equivalent to the local 0.9 release gate.

## Coverage job

A separate Ubuntu job runs:

```bash
bun run test:coverage
```

Coverage is informative rather than a hard percentage gate for 0.9.0.

Some branches are intentionally platform-dependent, including:

- OS-specific application-data paths
- Python launcher resolution
- runtime availability/fallback paths
- filesystem failure branches

The cross-platform verification matrix is more valuable than manufacturing
tests solely to reach 100% line coverage.

## Test isolation in CI

Automated tests must not rely on a developer's machine-local Forge state.

The suite uses:

- temporary Forge projects
- temporary SQLite databases
- random local HTTP ports
- explicit stdio project selection

No test should require an existing project registration or the user's normal
Forge database.

## Pull requests

The repository includes:

```text
.github/pull_request_template.md
```

For code changes, keep the four automated checks green before merging:

```text
check
unit + integration
E2E
production build
```

UI-facing changes should additionally receive a manual browser pass.

## Diagnosing CI-only failures

When a test passes locally but fails in CI, first determine whether the failure
is:

1. operating-system-specific
2. runtime-discovery-specific
3. filesystem/path-specific
4. timing/process-lifecycle-specific

Do not immediately increase timeouts. Prefer surfacing the underlying startup
or process error first, as done by the in-process HTTP E2E server.

If only one operating system fails, reproduce with that platform before
changing shared behavior.
