# Documentation

Start with the **[0.10.0 developer guide](developer-guide.md)**. It walks through
installation, source selection, authoring, bridges, testing and native export.

## Build and connect

- [Project workflow](project-workflow.md): create/open/close, workspace views and recovery.
- [Native authoring](native-authoring.md): schemas, workers, editing and lifecycle.
- [MCPack integration](mcpack.md): runtime setup, architecture and maintainer override.
- [Bridge existing applications](bridged-sources.md): Node/Python hooks, cwd, checkout paths, imports and framework examples.
- [External MCP sources](external-sources.md): URLs, bearer variables, discovery and limits.
- [Project source reference](project-sources.md): manifest descriptors and lifecycle APIs.
- [Agent exposure](agent-exposure.md): visibility, aliases, descriptions and resource identities.

## Test and operate

- [Named tool test cases](named-test-cases.md): assertions, batches, drift and persistence.
- [Native deployment](native-deployment.md): export, files, dependencies, HTTP and stdio.
- [MCP stdio](mcp-stdio.md): explicit project selection and client configuration.
- [Docker](docker.md): local builds, versioned images, mounts and environments.
- [Application data](app-data.md): portable files, local state and backups.
- [Security model](security.md): trust, credentials, network boundaries and deployment scope.
- [Troubleshooting](troubleshooting.md): common failures and recovery.
- [Legacy compatibility](legacy-compatibility.md): older projects and deliberate migration.

## Examples

- [Five-framework compatibility lab](../examples/bridges/compatibility-lab/README.md)
- [Node registry adapter](../examples/bridges/adapters/registry.mjs)
- [Python FastMCP adapter](../examples/bridges/adapters/fastmcp_adapter.py)
- [Strands agent demo](../examples/agent/README.md)

## Contribute and release

- [Contributing](../CONTRIBUTING.md)
- [Testing](testing.md) and [continuous integration](ci.md)
- [Release rehearsal checklist](release-checklist.md)
- [Roadmap and acceptance mapping](roadmap.md)
- [Changelog](../CHANGELOG.md)
