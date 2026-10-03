# Project workflow and continuation guide

Target branch: `v0.10.0`. Follow-up to PR #14; tracked in issue #15.

## Product decisions

- Projects are folders owned by developers. Recent projects are a local registry.
- Opening a project selects its MCP endpoint; closing stops its sources and rejects new MCP work.
- The project workspace groups tools, resources and prompts and identifies their sources.
- Native capabilities execute exclusively through MCPack 0.9.0. Node and Python are supported.
- Bridge adapters and external servers contribute complete catalogs, not individual imported tools. Their code and schemas remain owned by the source; later local aliases must preserve routing identity.
- Names and resource URIs can collide across any sources. Until aliases exist, fail closed.
- Native export will include only native code, manifests and dependency declarations. No secrets or remote/bridge capabilities.
- Runtime controls currently operate on sources; do not represent source status as per-worker telemetry.
- Preserve theme switching. Keep legacy data recognizable; never silently relabel it native.

## Delivery order

1. Unified project navigation, recent-project search, native creation and shared editing.
2. Bridge lifecycle and routing for Node/Python; external connection discovery and authentication.
3. Native-only export and dependency handling; improved runtime telemetry and supported controls.
4. End-to-end mixed-source testing, documentation and release review.

## Continue in a fresh chat

Use ModernSoftware/modern-mcp-forge, base v0.10.0, working branch
feat/unified-project-workflow and issue #15. Inspect the linked PR and current CI
before editing. Do not merge or publish without the user's instruction. Keep
changes in this branch. Read this document and the PR's test results; do not
assume future items above are implemented.

## Implemented in the workspace PR

- Search recent projects; open into the unified workspace.
- Create one native capability in a new source, a new worker in an existing source,
  or bind an existing worker handler. Node and Python use MCPack 0.9.0.
- Edit metadata and full definitions; tool schemas also have an explicit simple-field builder.
- Filter/search capabilities and disable them without removing their code.
- Configuration links to the same editors, shows configured workers, and manages sources.
- Retire standalone preview selection. Close protects dirty drafts, stops sources and disables MCP.
- Legacy data remains labeled and accessible through older views for deliberate migration.

## Manual browser regression

Create project → Add capability (tool/Node) → edit description → Save definition →
Workspace → Disable/Enable → Edit details → change description → Close and decline
(confirm project remains active) → Close and accept → Projects. Verify `/mcp` returns 503. Repeat creation for a Python resource and reuse a worker for a prompt. Try
searching recent projects, dark theme and a narrow viewport. No browser console
errors should occur when editing JSON.

Source controls restart all sources after configuration edits. Individual worker
stop/restart and native execution-history persistence are not implemented yet.
