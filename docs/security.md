# Security and trust model

## Local development boundary

Forge is a trusted, single-user local workbench. Opening an enabled project can
start its workers and adapters. They run with the operating-system account's
permissions and can access files, the network and configured credentials.
Separate processes, cwd settings and virtual environments are not sandboxes.
Inspect unknown projects before enabling their sources.

Management and MCP endpoints use local Host/Origin checks. Keep the workbench on
your machine; Compose binds its published port to `127.0.0.1`. These protections
are not production OAuth, a multi-user login system or per-user authorization.
Do not expose the authoring UI through a public reverse proxy.

## Credentials and upstream servers

Store variable names in project manifests and supply values in the process
starting Forge. Do not put tokens in URLs, args, cases or source-controlled files.
Bun can load a local `.env` file; keep it untracked. Environment changes require
restarting Forge. Containers require explicit environment forwarding.

Each external source uses its own configured credential. Forge does not forward
inbound caller Authorization headers or caller identity to the upstream. Bearer
authentication requires HTTPS except for literal loopback hosts. Redirects and
cross-endpoint requests are rejected. See [external sources](external-sources.md)
for bounds and diagnostics. OAuth login and refresh happen outside Forge.

Bridge processes inherit basic OS variables and only explicitly configured
additional names. MCPack manifests control worker environment inheritance.
Only connect servers and implementations you trust: testing makes real calls.
Exposure controls change the shared agent catalog, not source permissions.

## Results, logs and exported files

Tool output is untrusted data. Inspect responses before acting on instructions
inside them. Execution history includes inputs/results; worker stderr can contain
secrets. Local SQLite databases, screenshots and shared bug reports can therefore
contain sensitive data even when manifests store only variable names.

Exports omit known excluded files and environment values, but arbitrary code,
assets and custom configuration are copied as selected. Review them for secrets.
The exporter cannot identify every credential hidden in application content.
Cases should use synthetic data. Do not commit real tokens or customer records.

## Standalone production deployment

Deploy native capabilities through the exported MCPack server, not the Forge UI.
For a network listener, follow [native deployment](native-deployment.md): configure
a service token, TLS and allowed hosts/origins, and use a process manager. A shared
service token is not OAuth delegation or per-user access control. Application
handlers remain responsible for their business authorization and data access.

## Reporting a vulnerability

Use the repository's [Security page](https://github.com/ModernSoftware/modern-mcp-forge/security)
to check available private reporting channels. Do not include secrets or working
exploit credentials in a public issue. If private reporting is unavailable, open
a minimal contact request without sensitive details so maintainers can arrange
an appropriate channel.
