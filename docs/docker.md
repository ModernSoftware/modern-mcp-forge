# Docker and GHCR

Docker is an optional distribution for Modern MCP Forge. Running Forge directly
on the host remains the most natural development setup because Forge executes
local Tool processes and works with local project files.

The published image is:

```text
ghcr.io/modernsoftware/modern-mcp-forge
```

The examples below use the `edge` tag, which tracks successful Docker-relevant
changes on `main`. Versioned image tags are published from GitHub Releases.

## Image contents

The standard image includes:

- Bun 1.4.2
- Node.js 22
- Python 3
- the production SvelteKit/adapter-node build of Modern MCP Forge

This lets Bun, Node.js, and Python Tools execute inside the container without
installing those runtimes separately.

## Docker Compose

The repository includes `compose.yaml`.

Choose a host directory containing the Forge projects you want the container to
access, then start Forge.

Linux/macOS:

```bash
export MCP_FORGE_PROJECTS_ROOT=/absolute/path/to/projects
docker compose up -d
```

PowerShell:

```powershell
$env:MCP_FORGE_PROJECTS_ROOT = 'C:\repos\mcp-projects'
docker compose up -d
```

Open:

```text
http://localhost:5173
```

Inside the container the mounted project directory appears as:

```text
/workspace
```

Use Forge's directory browser to open projects below that path.

The default Compose configuration also creates a named volume for `/data`, so
the project registry and execution history survive container replacement.

## Mounting more than one project root

Compose can expose additional host directories by adding bind mounts:

```yaml
services:
  forge:
    volumes:
      - forge-data:/data
      - /host/work:/workspace/work
      - /host/personal:/workspace/personal
```

Only paths explicitly mounted into the container are visible to containerized
Forge. Avoid mounting an entire host drive or filesystem.

## Run without Compose

```bash
docker run --rm \
  -p 127.0.0.1:5173:3000 \
  -v modern-mcp-forge-data:/data \
  -v /absolute/path/to/projects:/workspace \
  ghcr.io/modernsoftware/modern-mcp-forge:edge
```

## Tool dependencies

A bind mount shares project files, but the Tool process still executes in the
Linux container.

That distinction matters for environment-specific dependencies:

- a Windows or macOS Python virtual environment cannot be executed as a Linux
  virtual environment inside the container
- native Node modules installed for the host OS may need to be installed again
  for Linux
- system packages required by a Tool must exist in the image

For Tools with additional runtime dependencies, build a small derived image or
run Forge natively on the host.

## Ports and security

Compose publishes Forge only on host loopback by default:

```text
127.0.0.1:5173
```

The application listens on `0.0.0.0:3000` inside the container so Docker can
forward the loopback-bound host port.

Modern MCP Forge executes project Tool code. Treat untrusted Forge projects the
same way you would treat any other untrusted source-code repository.

## GHCR publishing

The Docker workflow lives at:

```text
.github/workflows/docker.yml
```

It builds and smoke-tests the image before publishing.

Publishing rules:

- pull request: build + smoke test only
- push to `main`: publish `edge`
- published GitHub Release: publish the release SemVer tags
- stable GitHub Release: also publish `latest`
- manual dispatch with a version: publish that SemVer version

Published release images are built for:

```text
linux/amd64
linux/arm64
```

The workflow also publishes a GitHub artifact provenance attestation for the
image digest.
