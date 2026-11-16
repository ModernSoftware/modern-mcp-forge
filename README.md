<div align="center">

# Modern MCP Forge

Build, connect, test and deploy MCP capabilities from a local visual workbench.

[![CI](https://github.com/ModernSoftware/modern-mcp-forge/actions/workflows/ci.yml/badge.svg?branch=v0.10.0)](https://github.com/ModernSoftware/modern-mcp-forge/actions/workflows/ci.yml)
[![Docker](https://github.com/ModernSoftware/modern-mcp-forge/actions/workflows/docker.yml/badge.svg)](https://github.com/ModernSoftware/modern-mcp-forge/actions/workflows/docker.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Local-first · Node and Python · Git-friendly · Windows, macOS and Linux

</div>

This branch prepares **Forge 0.10.0** for release rehearsal. A version in
`package.json` does not mean a tag or container has been published. Check
[GitHub Releases](https://github.com/ModernSoftware/modern-mcp-forge/releases)
for published versions.

Forge combines native MCPack sources, project-owned bridge adapters and external
Streamable HTTP servers into one project MCP endpoint. Author tools, static
resources and prompts; inspect the catalog; test real implementations; and choose
what agents can discover. Native sources run with the published
`@modern-software/mcpack@0.9.1` dependency and can deploy without Forge.

## Features

| Workflow | Included in 0.10.0 |
| --- | --- |
| Projects | Create/open/close, searchable recents, source groups and remembered workspace filters |
| Native authoring | Node/Python workers, schemas, Monaco code editing, resources and prompts |
| Existing applications | Node/Python adapters or local stdio entrypoints; application code stays with its owner |
| External servers | Streamable HTTP discovery and calls, optional bearer-token environment references |
| Testing | Schema-driven forms, JSON editing, sample inputs, formatted results and supported image previews |
| Regression cases | Named inputs, expected success/tool error/invalid input, exact assertions and sequential batches |
| Agent exposure | Hide upstream capabilities, set public aliases/descriptions and resolve naming collisions |
| Diagnostics | Source lifecycle/recovery and local tool execution history |
| Deployment | Native source tar.gz archive with selected files, dependency manifests and standalone MCPack host |

## Start locally

Install Bun **1.4.2** and Node.js **22+**. Python **3.11+** is needed for Python
sources. The optional compatibility lab has additional pinned requirements.

```sh
git clone --branch v0.10.0 https://github.com/ModernSoftware/modern-mcp-forge.git
cd modern-mcp-forge
bun install --frozen-lockfile
bun run dev
```

Open the URL Vite prints. Create a project in your own folder, then choose
**Add tool**, **Add resource**, **Add prompt**, **Bridge existing implementation**
or **Connect external server**. `bun run dev` checks Forge's frozen lockfile;
workers and adapters have their own dependency installation.

Follow the **[developer guide](docs/developer-guide.md)** for a complete first
project, complex implementations, bridges, testing and deployment.

## Connect an agent

With the project open, copy its agent URL from the workspace (normally
`http://localhost:5173/mcp`) into Inspector or a Streamable HTTP MCP client.
Reconnect after source/catalog/exposure changes. Closing the project stops its
sources and makes the interactive endpoint unavailable.

For client-launched sessions, use [stdio](docs/mcp-stdio.md). For a model-driven
walkthrough, see the [Strands agent example](examples/agent/README.md).

## Explore realistic examples

The [compatibility lab](examples/bridges/compatibility-lab/README.md) combines a
Node pricing tool, Python delivery estimator and five applications using
FastAPI-MCP, FastMCP, xmcp, Mastra and MCP Framework. It includes dependencies,
configuration, normal results, business failures and protocol parity checks.

## Deployment and distribution

- [Export a native pack](docs/native-deployment.md) to run an MCPack server
  independently of Forge. Bridges/external connections are not included.
- [Run Forge with Docker](docs/docker.md), including local rehearsal builds,
  persistent data, project mounts and environment settings.
- Existing classic projects retain their [compatibility path](docs/legacy-compatibility.md);
  new authoring uses MCPack.

Forge executes trusted project code with your user's permissions. Keep the
workbench local. It is not a sandbox or a multi-user production gateway.
Read the [security model](docs/security.md) before attaching applications.

## Documentation and contributing

- [Documentation index](docs/README.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Contributing](CONTRIBUTING.md), [testing](docs/testing.md) and [CI](docs/ci.md)
- [0.10.0 release checklist](docs/release-checklist.md) and [roadmap](docs/roadmap.md)
- [Changelog](CHANGELOG.md)

Built by [Modern Software](https://github.com/ModernSoftware).
Licensed under [Apache-2.0](LICENSE).
