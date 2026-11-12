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

## Dependency maintenance and release gates

Run `bun run audit:dependencies` and `bun run audit:export` after a frozen install.
The second command audits the separate npm lockfile shipped in native exports.
The Dependency security workflow runs both checks on PRs, release/main pushes and
weekly on the default branch. High/critical findings block the check; full JSON
reports retain low/moderate findings for review. Registry failures also fail.
There are no suppressed advisory IDs or `continue-on-error` audit gates.
The Docker publication workflow repeats both checks before publishing an image.
Configure both `Dependency audit` matrix checks as required branch checks.

Dependabot proposes Bun, export npm and GitHub Actions updates against `v0.10.0`.
After merging the release into main, remove `target-branch` from that configuration.
Schedules and Dependabot configuration become active from the default branch.
Review updates, their release notes, functional tests and deployment/browser CI;
do not automatically merge dependency major versions.

### Security patch release order

1. Review, merge and publish MCPack **0.9.1** using its staged npm workflow and
   maintainer approval. Forge's current 0.9.0 pin transitively installs SDK 2.0.0.
2. Update Forge's exact MCPack pin and `bun.lock`, and the exact pin and
   `package-lock.json` under `src/lib/server/deployment/template`, using the real
   published package. The Forge security PR remains a draft until this is done;
   audit checks intentionally remain red while these affected dependencies exist.
3. Update current-version documentation/fixtures and the MCPack Support Desk
   registry example. Repeat published-package, Node/Python compatibility, native
   export, browser and container checks. An audit of Forge alone does not certify
   the exported package or a user's application dependencies.
4. Merge Forge only with passing audits and functional checks, then perform the
   final clean-install/export smoke test and release. Do not suppress the SDK
   advisories, use unpublished version pins, or treat source-built tests as proof
   that a registry package has been published.

### Mitigations and remaining findings

The workbench's MCP endpoint caps POST bodies at 1 MiB and tool argument object
members/array elements at 10,000 before SDK schema validation. The patched SDK
also caps JSON-RPC batches at 100 messages. These are admission limits, not rate
limiting, authentication, or an instruction to expose the authoring UI publicly.
See the [SDK validation advisory](https://github.com/advisories/GHSA-46jr-4wx8-v453).

Monaco vendors DOMPurify, so the Vite alias redirects its sanitizer import to our
patched `dompurify` dependency. The direct dependency and override update the
dependency graph too. Keep the alias and browser regression check until upstream
Monaco includes the patched sanitizer; a lockfile-only override is insufficient.

Review dated 2026-11-12: the remaining non-SDK findings after these updates are
low severity. SvelteKit 2's
[enhanced-form redirect](https://github.com/advisories/GHSA-pfhg-q3qv-9q6r) and
[prerendered-header](https://github.com/advisories/GHSA-27mw-82g8-phjj) paths are not
used by Forge (no enhanced form actions or prerendered application pages).
The [cookie serialization finding](https://github.com/advisories/GHSA-pxg6-pf52-xh8x)
has no application-controlled cookie name/path/domain sink here.
[deepmerge prototype poisoning](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
is in build dependencies; Forge does not merge untrusted runtime data with it.
These are code-based reachability assessments, not security guarantees. Review
them before release and whenever these features are introduced; plan a separately
tested SvelteKit major upgrade rather than silently forcing it in this patch.

Enable private vulnerability reporting, dependency alerts, secret scanning and
push protection where available, and require reviews/checks on release branches.
Maintain container OS scans and image provenance, non-root deployment and ingress
limits, and audit Python/application dependencies independently. Dependency audits
do not detect every vulnerability or replace these controls. Repository settings
and production infrastructure are not changed by this patch.

## Reporting a vulnerability

Use the repository's [Security page](https://github.com/ModernSoftware/modern-mcp-forge/security)
to check available private reporting channels. Do not include secrets or working
exploit credentials in a public issue. If private reporting is unavailable, open
a minimal contact request without sensitive details so maintainers can arrange
an appropriate channel.
