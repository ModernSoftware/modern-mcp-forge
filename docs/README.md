# 📚 Documentation

This folder contains the public and maintainer-facing documentation that is
useful beyond the implementation sessions that originally created Modern MCP
Forge.

## Current documents

- [Application data](app-data.md) — where Forge stores machine-local state
- [MCP stdio transport](mcp-stdio.md) — stdio architecture, usage, and rules
- [Testing](testing.md) — automated test layers and local commands
- [Continuous integration](ci.md) — GitHub Actions and cross-platform CI
- [0.9.0 release checklist](release-checklist.md) — final public-beta gate

The agent example has its own documentation at
[`examples/agent/README.md`](../examples/agent/README.md).

## What should not live here

Development-slice notes such as:

```text
slice-5a-...
slice-7b-...
slice-8c-...
```

were useful while the application was being built, but they are implementation
history rather than product documentation. They can be deleted before the
public release.

The same applies to one-off migration notes for behavior that no longer exists.

## Documentation still planned for 0.9.0

- getting started / installation
- architecture
- Forge Tool ABI
- security
- troubleshooting
- contribution guide

Once those exist, this file can act as the permanent documentation index.
