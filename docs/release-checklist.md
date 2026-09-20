# 0.9.0 release checklist

This checklist is the final release gate for the first public beta.

## Automated verification

- [ ] `bun run check`
- [ ] `bun run test`
- [ ] `bun run test:e2e`
- [ ] `bun run test:coverage`
- [ ] `bun run build`
- [ ] `bun run test:all`

## GitHub Actions

- [ ] Ubuntu verification is green
- [ ] Windows verification is green
- [ ] macOS verification is green
- [ ] Coverage job is green
- [ ] Fresh clone + `bun install --frozen-lockfile` works

## Manual UI QA

Run the browser QA pass in both light and dark themes.

- [ ] Projects dashboard
- [ ] create project
- [ ] open existing project
- [ ] close and reopen project
- [ ] forget project without deleting files
- [ ] missing-project detection/recovery
- [ ] filesystem directory picker
- [ ] create-folder flow
- [ ] Tool list/detail/edit lifecycle
- [ ] Resource list/detail/edit lifecycle
- [ ] Prompt list/detail/edit lifecycle
- [ ] Monaco editing
- [ ] enable/disable/re-enable definitions
- [ ] delete definitions without deleting source files
- [ ] execution history and diagnostics
- [ ] Project advanced JSON view
- [ ] responsive layout at narrow desktop/tablet widths
- [ ] no obvious clipping, overlap, or unreachable actions

## Runtime QA

Use real Forge projects rather than only test fixtures.

- [ ] Bun starter Tool executes
- [ ] Node starter Tool executes
- [ ] Python starter Tool executes
- [ ] tool arguments render and validate
- [ ] nested JSON Schema input works
- [ ] stderr is visible as diagnostics
- [ ] timeout behavior is understandable
- [ ] malformed Tool ABI output produces a useful error

## MCP QA

### Streamable HTTP

- [ ] `/mcp` works with a project open
- [ ] Tools are advertised and callable
- [ ] Resources are advertised and readable
- [ ] Prompts are advertised and renderable
- [ ] disabled definitions are not advertised
- [ ] closing the active project makes `/mcp` unavailable as designed

### stdio

- [ ] stdio starts with an explicit project
- [ ] missing/invalid project fails on stderr without protocol pollution
- [ ] Tools work from a real MCP host
- [ ] Resources work from a real MCP host
- [ ] Prompts work from a real MCP host

Test at least one real host/IDE in addition to the SDK E2E client.

## Cross-platform manual pass

At minimum verify project creation, Tool execution, and stdio on:

- [ ] Windows
- [ ] Linux
- [ ] macOS

CI supplies broad automated coverage, but native filesystem browsing and shell
runtime discovery deserve a real manual pass.

## Security and trust model

- [ ] opening/running an untrusted Forge project is documented as code execution
- [ ] local-management endpoints remain loopback-only
- [ ] stdio stdout remains protocol-only
- [ ] secrets are not stored in `forge.project.json`
- [ ] `.env` files remain ignored
- [ ] no personal paths, tokens, test databases, or generated artifacts are committed

## Documentation

- [ ] README installation/quick-start is current
- [ ] project manifest format is documented
- [ ] Tool ABI is documented
- [ ] Streamable HTTP usage is documented
- [ ] stdio usage is documented
- [ ] application-data paths are documented
- [ ] testing/CI is documented
- [ ] security model is documented
- [ ] troubleshooting contains common runtime/path issues
- [ ] contribution instructions are present

## Release cut

Do these only after automated CI and manual QA are green.

- [ ] set package version to `0.9.0`
- [ ] update changelog
- [ ] verify lockfile after version/dependency changes
- [ ] rerun `bun run test:all`
- [ ] commit the release candidate
- [ ] create Git tag `v0.9.0`
- [ ] create GitHub release notes
- [ ] verify a fresh clone from the tag
