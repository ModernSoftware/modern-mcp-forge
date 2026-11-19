# Changelog

## Unreleased

- Native export follows selected Node workers' local ESM imports recursively,
  preserving helper directories such as `services/`. Missing or excluded imports
  block download; manual dependency limits are visible in the expanded file review.
- Clean-deployment coverage now exercises a worker importing nested service
  helpers after Forge is stopped and the original workspace is removed.

## 0.10.0

Publication dates and version tags are recorded in
[GitHub Releases](https://github.com/ModernSoftware/modern-mcp-forge/releases).

- Security hardening: patched direct MCP SDK and transitive dependencies,
  explicit MCP body/tool validation limits, patched Monaco sanitizer resolution,
  and PR/weekly/publication audits for the workbench and exported deployment.
  The workbench and exported deployment both pin published MCPack 0.9.1.
  Remaining advisory assessments are documented in [the security guide](docs/security.md).

- Native authoring and execution through published MCPack 0.9.1, with persistent
  Node/Python workers and standalone deployment parity.
- Unified multi-source workspace, native editing, lifecycle/recovery and
  remembered views, filters and grouping.
- External Streamable HTTP sources with bearer environment references, discovery,
  namespacing and isolated connection failures.
- Project-owned Node/Python adapters and existing stdio bridges, including separate
  application checkouts and a five-framework compatibility lab.
- Native deployment tar.gz export with capability/file selection, dependency
  declarations and a standalone MCPack host.
- Schema-driven form/JSON testing, sample argument generation and formatted
  structured/text/image result previews.
- Named tool cases with exact assertions, expected failures, schema drift checks
  and sequential batch execution.
- Agent exposure settings for upstream visibility, public aliases and descriptions.
- Previewed handler insertion into shared Node/Python workers, explicit new-worker and existing-handler choices, visual prompt argument authoring/testing, and visible file-conflict recovery.
- Argument-free and optional-only prompts accept omitted MCP argument maps while required prompt arguments remain validated.
- Developer/reference documentation and a 0.10.0 rehearsal checklist.
- Removed unused native-list/definition-dialog components and obsolete session
  review notes; retained active classic-project compatibility.

Existing classic projects remain supported. Native export does not include
bridged/external sources. See [release scope](docs/roadmap.md) for deferred features.
