# Release scope and roadmap

Forge 0.10.0 focuses on a complete local development loop: native authoring,
Node/Python bridges, external HTTP connections, testing, agent exposure and
standalone native export. Rehearsal findings determine release blockers;
additional product features are separate increments.

## Acceptance mapping

The following work is present on `v0.10.0`. Issue state may lag merged code;
use the linked implementation and tests to reconcile GitHub, not the issue title
alone. The mapping was reviewed for the 0.10.0 rehearsal on 2026-11-05.

| Issue | Implemented evidence | Acceptance disposition |
| --- | --- | --- |
| [#5](https://github.com/ModernSoftware/modern-mcp-forge/issues/5) npm scope | [PR #6](https://github.com/ModernSoftware/modern-mcp-forge/pull/6), `@modern-software/mcpack` resolution | Completed; the old private/local install path is superseded by published-package setup and explicit CLI override |
| [#7](https://github.com/ModernSoftware/modern-mcp-forge/issues/7) npm consumption | [PR #8](https://github.com/ModernSoftware/modern-mcp-forge/pull/8), package and lockfile | Completed; its original alpha pin was subsequently upgraded |
| [#9](https://github.com/ModernSoftware/modern-mcp-forge/issues/9) MCPack 0.9.0 | [PR #10](https://github.com/ModernSoftware/modern-mcp-forge/pull/10), [runtime parity tests](../tests/integration/mcpack-session.test.ts) | Completed; cross-platform published-package checks remain a release gate |
| [#11](https://github.com/ModernSoftware/modern-mcp-forge/issues/11) source lifecycle | [PR #12](https://github.com/ModernSoftware/modern-mcp-forge/pull/12), [source tests](../tests/integration/project-sources.test.ts) | Completed; standalone preview was superseded by the unified project workflow |
| [#13](https://github.com/ModernSoftware/modern-mcp-forge/issues/13) native authoring | [PR #14](https://github.com/ModernSoftware/modern-mcp-forge/pull/14), [HTTP authoring tests](../tests/e2e/native-authoring.test.ts) | Completed; folder editing/automatic migration were explicitly separate |
| [#15](https://github.com/ModernSoftware/modern-mcp-forge/issues/15) unified workspace | [PR #16](https://github.com/ModernSoftware/modern-mcp-forge/pull/16), [workspace browser checks](../tests/browser/workspace-export.mjs) | Completed; individual-worker controls remain deferred |
| [#17](https://github.com/ModernSoftware/modern-mcp-forge/issues/17) external sources | [PR #18](https://github.com/ModernSoftware/modern-mcp-forge/pull/18), [external E2E tests](../tests/e2e/external-sources.test.ts) | Completed for Streamable HTTP and supplied bearer tokens; OAuth/templates were excluded |
| [#20](https://github.com/ModernSoftware/modern-mcp-forge/issues/20) five frameworks | [PR #22](https://github.com/ModernSoftware/modern-mcp-forge/pull/22), [lab and Inspector replay](../examples/bridges/compatibility-lab/README.md) | Completed for pinned fixtures; cancellation proves caller cancellation/cleanup, not interruption of every framework handler |
| [#25](https://github.com/ModernSoftware/modern-mcp-forge/issues/25) visual tool inputs | [PR #26](https://github.com/ModernSoftware/modern-mcp-forge/pull/26), [tester browser checks](../tests/browser/tool-arguments.mjs) | Completed with JSON fallback for unsupported forms |

Bridges were delivered in [PR #19](https://github.com/ModernSoftware/modern-mcp-forge/pull/19),
native export in [PR #24](https://github.com/ModernSoftware/modern-mcp-forge/pull/24),
and named cases/exposure in [PR #27](https://github.com/ModernSoftware/modern-mcp-forge/pull/27).
Acceptance is bounded by the documented feature scope, not universal framework
compatibility or proof that every application is safe to run.

The existing [PR #4](https://github.com/ModernSoftware/modern-mcp-forge/pull/4)
tracks `v0.10.0` into `main`. Keep it open for the release review; its original
preview description needs to be replaced with the final release scope before
merging. Feature completion does not by itself authorize that release merge.

## Deferred work

| Item | Scope |
| --- | --- |
| [Dependency manager #21](https://github.com/ModernSoftware/modern-mcp-forge/issues/21) | Inspect/manage native and adapter dependencies; never rewrite the connected application's manifests |
| [Deployment gateway #23](https://github.com/ModernSoftware/modern-mcp-forge/issues/23) | Opt-in external connections, production URL/token variables and failure isolation; current export is native-only |
| OAuth client workflow | Login, consent and refresh rather than supplied access tokens |
| Runtime controls | Individual-worker stop/restart and richer telemetry |
| Catalog updates | Automatic notification/rediscovery rather than explicit source reload and client reconnect |
| .NET/Go | MCPack runtime contracts and parity first, then Forge authoring/integration |
| Broader authoring/testing | Folder editing, compilation, resource/prompt cases and a supported saved-case CI runner |
| Broader MCP relay | Resource templates/subscriptions, server-initiated sampling/elicitation and task APIs |

These are not hidden promises in the 0.10.0 release. Use the
[release checklist](release-checklist.md) to finish acceptance before adding scope.
