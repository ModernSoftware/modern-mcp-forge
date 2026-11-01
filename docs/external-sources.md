# External MCP sources

External sources connect a Forge project to trusted Streamable HTTP MCP servers.
Their tools, static resources and prompts share the project's `/mcp` endpoint with
native MCPack capabilities. This is development aggregation, not MCPack deployment.

## Connect and test

1. Open a project and choose **Connect external server** in the workspace.
2. Enter a unique connection name and the full Streamable HTTP MCP endpoint.
3. Choose **No authentication** for a public server, or **Bearer token** for a protected one. In the latter case, enter an environment-variable name such as `EXAMPLE_MCP_TOKEN`.
4. Connect, inspect the discovered catalog, and test a tool, resource or prompt. Use **Show more** to read a long description and **Show less** to collapse it. Clients receive its full text.
5. Reconnect Inspector or your agent to Forge after changing sources.

Forge verifies an enabled connection before saving it. A failed attempt leaves the draft available to edit or cancel. A failed edit preserves the last saved configuration and session. If a previously saved external server goes offline, its catalog is omitted while healthy sources remain usable. Use **Manage connection** in the workspace to repair, disable or remove it. Reload to rediscover it when it recovers.

## Set a bearer token on Windows

The upstream service issues the **access token**. You choose the environment-variable name. Forge reads its value from the process that runs `bun run dev` and adds the `Bearer ` prefix. The project manifest stores only the variable name.

In Git Bash, stop the existing Forge process, then run these commands in the Forge repository. Paste the raw token at the hidden prompt.

```bash
read -rsp 'Access token: ' EXAMPLE_MCP_TOKEN; echo
export EXAMPLE_MCP_TOKEN
bun run dev
```

In PowerShell 7.1 or later, use:

```powershell
$env:EXAMPLE_MCP_TOKEN = Read-Host 'Access token' -MaskInput
bun run dev
```

For [the hosted Inspector example](https://github.com/modelcontextprotocol/inspector/blob/main/specification/v2_auth_smoke_testing.md), connect Inspector directly to `https://example-server.modelcontextprotocol.io/mcp` and complete OAuth consent. In Inspector versions with **Connection Info → OAuth Details**, copy the access token for that server. Use it as the variable value, then enter `EXAMPLE_MCP_TOKEN` in Forge. Forge currently accepts a supplied access token. OAuth login and token refresh happen outside Forge. Replace expired tokens and restart Forge in the same terminal.

## Identity and schemas

Names are prefixed as `connection__original`. Names that would exceed 64 characters
or contain unsupported characters receive a stable hash suffix. Resource URIs use
`forge-external://source/<connection>/<encoded-original-uri>`. Routing always uses
the original upstream identity. Known resource links and embedded resources in
results are translated to the Forge namespace; arbitrary text and structured data
are not rewritten.

Forge exposes a resource once when multiple pages return the same URI and identical metadata. Different definitions for one URI produce a discovery error. All entries count toward discovery limits, including repeats.

Discovery preserves input schemas, tool annotations and output schemas. The catalog
is read-only: Forge does not edit external handler code or input validation.
Per-capability aliases, metadata overrides and exposure controls are future work;
this slice supports connection-level disable and automatic namespacing. Collisions
with native/legacy names still fail closed; Forge never silently shadows a tool.

Only listed static resources are supported. Resource templates, subscriptions,
server-initiated sampling/elicitation, task APIs, upstream list-change notifications,
legacy SSE transport and OAuth login/refresh are not relayed. Reload sources to
rediscover changes. Neither caller identity nor inbound Authorization headers are
forwarded: each source uses its own explicitly configured credential.

## Bounds and trust

- HTTPS is required for bearer authentication, except literal loopback hosts.
- Redirects and requests to different endpoints are rejected, including automatic
  auth discovery. This prevents forwarding credentials to a redirect target.
- URLs cannot embed credentials, query strings or fragments. Private network URLs
  are permitted intentionally for local development; only attach trusted projects.
- Discovery has a 30-second overall deadline, 100-page and 2,000-item limits per
  category, and rejects repeated cursors. Responses/streams are limited to 8 MiB.
- Calls time out after 20 seconds. Forge never retries a failed write. A timeout or
  disconnect can leave its outcome unknown; verify upstream before retrying.
- Authentication failures identify HTTP 401 or 403. Discovery errors identify the handshake or list operation and report safe status codes, timeouts, or catalog conflicts. Remote response bodies stay out of diagnostics. Successful tool output is still untrusted upstream
  content and is shown as returned.
- Local Host/Origin checks protect management operations. Forge is not a production
  auth gateway, and shared project credentials do not establish user authorization.

## Verification

Integration tests run real local MCP servers for routing, nested schemas, bearer
authentication, missing capabilities, pagination, cursor failures and redirects.
The HTTP workflow test mixes native and external sources, checks schema fidelity,
inspects workspace pages, and verifies disabling, stale generations and close.
