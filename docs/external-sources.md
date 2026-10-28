# External MCP sources

External sources connect a Forge project to trusted Streamable HTTP MCP servers.
Their tools, static resources and prompts share the project's `/mcp` endpoint with
native MCPack capabilities. This is development aggregation, not MCPack deployment.

## Connect and test

1. Open a project and choose **Connect external server** in the workspace.
2. Enter a unique connection name and the full Streamable HTTP MCP endpoint.
3. Optionally enter a bearer-token **environment-variable name**, such as
   `SUPPORT_MCP_TOKEN`. Set its value in the environment that starts Forge. Do not
   put the token itself in the form, URL or project manifest.
4. Connect, inspect the discovered catalog, and test a tool/resource/prompt.
5. Reconnect Inspector or your agent to Forge after changing sources.

Configuration links to each connection. You can update its URL/auth reference,
disable/enable it, remove it, or reload all sources. A failed connection stays
editable. Startup remains fail-closed: a failing enabled source prevents the
combined project catalog from being served; disable that source to restore the
others. Closing/switching projects closes local clients and makes a best-effort
attempt to terminate upstream sessions.

## Identity and schemas

Names are prefixed as `connection__original`. Names that would exceed 64 characters
or contain unsupported characters receive a stable hash suffix. Resource URIs use
`forge-external://source/<connection>/<encoded-original-uri>`. Routing always uses
the original upstream identity. Known resource links and embedded resources in
results are translated to the Forge namespace; arbitrary text and structured data
are not rewritten.

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
- Remote transport/protocol errors are generic so response bodies cannot expose
  tokens in Forge diagnostics. Successful tool output is still untrusted upstream
  content and is shown as returned.
- Local Host/Origin checks protect management operations. Forge is not a production
  auth gateway, and shared project credentials do not establish user authorization.

## Verification

Integration tests run real local MCP servers for routing, nested schemas, bearer
authentication, missing capabilities, pagination, cursor failures and redirects.
The HTTP workflow test mixes native and external sources, checks schema fidelity,
inspects workspace pages, and verifies disabling, stale generations and close.
