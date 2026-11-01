# Local Node and Python bridges

A bridge runs a developer-owned MCP stdio server in the project. Forge launches the process, discovers its tools, static resources and prompts, and publishes them through the open project's Streamable HTTP endpoint. Use an existing server factory by writing a small entrypoint that creates the server and connects it to stdio. A bridge and its dependencies belong to the developer's project.

## Try the starters

1. In **Workspace → Attach bridge**, give the source a name such as `inventory` or `shipping` and select **Node.js** or **Python**. Leave Entrypoint empty and choose **Create starter files**. This writes files under `bridges/<name>/` and fills the entrypoint. An existing folder is preserved.
2. Install the starter's dependencies from that folder. For Node, run `npm install`. For Python, create a virtual environment with `python -m venv .venv`. On Windows run `.venv\Scripts\python.exe -m pip install -r requirements.txt`. On macOS or Linux run `.venv/bin/python -m pip install -r requirements.txt`.
3. Choose **Attach bridge**. Forge starts the server and verifies its catalog before saving the connection. A failed or cancelled preview leaves the current manifest intact. Starter files created explicitly are available for editing and retrying.
4. Select **Bridged** in the workspace. Open **Inspect & test** to select that capability, or connect Inspector to the workspace's agent URL. The Node starter has a `stock` tool taking `{"sku":"DEMO"}`, a guide resource and a `review_stock` prompt. The Python starter provides `shipping_days` taking `{"region":"local"}`, a guide resource and a `review_shipping` prompt. The expected tool results are 12 and 2 respectively.
5. Edit your source in your IDE. **Reload sources** in Configuration restarts the project sources and rediscovers their catalogs. Reconnect agents to refresh their names. Disabling, removing or closing stops the owned bridge process. Removing a bridge keeps its source files.

## Attach an existing server

Choose the runtime and enter a project-relative entrypoint. The working directory defaults to the entrypoint's folder. Override it in **Launch settings** when the server resolves assets or its virtual environment from another directory. Both entrypoint and working directory must resolve inside the project. Build TypeScript to JavaScript first if your Node version or code needs a compiler. The Node starter uses the official TypeScript SDK from JavaScript. The Python starter uses FastMCP from the official Python SDK.

A bridge descriptor in `forge.project.json` can look like this:

```json
{
  "kind": "bridge",
  "id": "inventory",
  "enabled": true,
  "runtime": "node",
  "entrypoint": "inventory/dist/stdio.js",
  "cwd": "inventory",
  "args": ["--profile", "development"],
  "inheritEnv": ["INVENTORY_API_TOKEN"],
  "naming": "collisions"
}
```

Forge launches the interpreter directly. Each string in `args` is one script argument, including when it contains spaces. For Python, Forge prefers `.venv` inside the chosen working directory, then uses the Forge Python runtime resolver. The child receives the MCP SDK's basic OS environment and the named variables from the Forge process. Missing named variables prevent startup. Keep secret values out of arguments and manifests. Send server logs to stderr and reserve stdout for MCP.

## Names and lifecycle

Unique tool and prompt names keep their original spelling by default. On a collision, choose the name published in the workspace. **Always prefix** keeps names independent of other sources. Static resource URIs use `forge-bridge://source/<id>/<encoded-uri>`. Forge translates the URI on reads and translates known resource links on the way back.

A saved bridge that cannot start or loses its process is marked failed. Healthy sources remain available. Repair the files or launch settings, then reload. Discovery has a 30-second overall deadline and each call has a 20-second timeout. Cancellation is forwarded to the upstream server and Forge never replays an interrupted write. The bridge must handle cancellation in its own handlers and own cleanup of any subprocesses it spawns. Project code runs with the local user's permissions.

The initial catalog covers tools, listed static resources and prompts. Resource templates, dynamic list updates, server-initiated sampling or elicitation, per-capability overrides, and packaging bridged code for deployment are outside this adapter.
