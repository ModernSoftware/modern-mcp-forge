# Run Forge with Docker

Docker distributes the local workbench, not your deployed MCP server. Use
[native export](native-deployment.md) for a standalone MCPack deployment.
Running Forge directly on the host is often simpler for applications that need
host runtimes, IDE builds or platform-specific dependencies.

## Rehearse the candidate before publication

The repository's Compose configuration targets `0.10.0` and includes a local
build definition. Until that image is published, build from the checked-out
candidate rather than pulling an older `edge` image:

```sh
docker compose up --build -d
```

This builds/tags locally; it does not publish. Open `http://localhost:5173`.
The default project mount is `./projects` on the host, visible as `/workspace`.
Create that directory or select an existing root as below. A named `forge-data`
volume preserves local state at `/data` across container replacement.

## Use a published version

After the 0.10.0 release image is available:

```sh
docker compose pull
docker compose up -d --no-build
```

The image is `ghcr.io/modernsoftware/modern-mcp-forge:0.10.0`. Select another
published version with `MCP_FORGE_IMAGE`; `edge` follows qualifying changes on
`main` and is not necessarily the current integration/rehearsal branch.

Linux/macOS/Git Bash:

```sh
export MCP_FORGE_PROJECTS_ROOT=/absolute/path/to/projects
export MCP_FORGE_IMAGE=ghcr.io/modernsoftware/modern-mcp-forge:0.10.0
docker compose up -d --no-build
```

PowerShell:

```powershell
$env:MCP_FORGE_PROJECTS_ROOT = 'C:/repos/mcp-projects'
$env:MCP_FORGE_IMAGE = 'ghcr.io/modernsoftware/modern-mcp-forge:0.10.0'
docker compose up -d --no-build
```

Use the directory browser inside Forge to open `/workspace/...`, not host paths.
`MCP_FORGE_PORT` changes the host port (default 5173); the container listens on
3000. The published port stays bound to host loopback.

## Image contents and dependencies

The image includes Bun 1.4.2, Node 22, Python 3, the production SvelteKit build,
the pinned MCPack package and Forge's bridge host scripts. It does not include
your project dependencies, the Python bridge SDK, uv, development examples or
the source-checkout stdio launcher.

The child processes execute inside Linux. Host Windows/macOS virtual environments
and native Node modules may not work. Install packages for the container platform
and selected interpreter. The optional compatibility lab needs its documented
Node 24/Python 3.12/uv environment, beyond the standard image.

For a Python bridge, use its generated `requirements-forge.txt` in the selected
Linux environment. A derived image can install system packages and Python venv
support needed by your application. Do not install application dependencies into
Forge's package manifest merely to make an adapter import succeed.

## Environment and separate checkouts

A host shell variable is not automatically passed into the container. Add explicit
environment mappings and mounts in a local `compose.override.yaml`, for example:

```yaml
services:
  forge:
    environment:
      INVENTORY_TOKEN: ${INVENTORY_TOKEN:?Set INVENTORY_TOKEN before starting}
      INVENTORY_CHECKOUT: /applications/inventory
    volumes:
      - /absolute/host/inventory:/applications/inventory
```

Use `INVENTORY_TOKEN` as the source's bearer-variable name and
`INVENTORY_CHECKOUT` as its adapter checkout-variable name. Set values before
starting/recreating the container. Use an untracked local environment file if
needed; do not commit tokens. Avoid sharing `docker compose config` output when
it expands secrets. Mount only directories the application needs.

## Inspect and stop

```sh
docker compose logs forge
docker compose down
```

`down` retains named volumes unless explicitly requested otherwise. Back up local
state and project files separately; see [application data](app-data.md).

## Publication

The [workflow](../.github/workflows/docker.yml) builds and smoke-tests before
publishing. PRs only verify. Qualifying `main` pushes publish `edge`. A published
GitHub release produces version and major/minor tags; non-prerelease releases
also update `latest`. Manual dispatch can publish a requested version. Release
and manual publication versions must match `package.json`.

Published builds target `linux/amd64` and `linux/arm64` with provenance
attestation. The automated smoke test runs on amd64. Verify the actual published
version/digest after release, including the intended target platform.
