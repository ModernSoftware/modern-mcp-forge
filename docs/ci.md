# Continuous integration

[CI](../.github/workflows/ci.yml) runs on pull requests, pushes to `main` and
`v0.10.0`, and manual dispatch. Ubuntu, Windows and macOS install the Bun version
from `package.json`, Node 22 and Python 3.13, then run:

- Frozen dependency install and runtime diagnostics.
- Repository documentation link checks.
- Svelte/TypeScript checks.
- Unit/integration tests.
- Python bridge SDK installation and MCP end-to-end tests.
- Published MCPack integration tests.
- Production build.

A separate Ubuntu job measures coverage. Coverage is informative, not a hard
percentage gate. Tests use temporary projects/databases, explicit project
selection and ephemeral ports; they must not use a developer's normal state.
Legacy `.NET` rejection tests do not imply .NET worker support.

## Compatibility, browsers and deployment

[Multilanguage examples](../.github/workflows/compatibility-lab.yml) runs manually
or for relevant PR paths, including package/lockfile changes. Its Linux job uses
Node 24.22.1, Python 3.12.14 and uv 0.13.4 for the pinned five-framework lab.
It then clean-installs/invokes native exports and runs the Chrome export/tester
suites. Browser screenshots are uploaded as `forge-ui`, including on failure,
and retained for seven days. A separate Windows job verifies native export.

This workflow is additional to `test:all`. See [testing](testing.md) for commands.

## Container verification and publication

[Docker](../.github/workflows/docker.yml) builds and smoke-tests on every PR.
PR runs do not log in to GHCR or publish. A qualifying `main` push publishes
`edge`; published releases and explicit version dispatches publish versioned
images. The requested publication version must match `package.json`.
Stable releases also publish `latest`; see [Docker](docker.md).

The smoke test runs on Linux amd64. Published images build amd64 and arm64;
building arm64 alone is not a manual runtime acceptance result for that platform.

## Diagnosing failures

Distinguish platform/runtime discovery, filesystem/path, lifecycle/timing and
application regressions. Read the failed step and source diagnostics before
raising timeouts. Browser checks must await navigation and the intended element;
avoid using fixed delays as a substitute for observed state. Preserve failure
artifacts and verify the final candidate commit rather than relying on a prior
branch's green run.
