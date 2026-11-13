# Multilanguage integration lab

Open this folder as a Forge project to serve seven tools from one HTTP endpoint. The two native tools share an MCPack manifest. Each bridge connects to an application with its own entrypoint, dependencies and business logic. The examples use seeded data and a simulated carrier, so calls are repeatable offline after installation.

## Run it

From the Forge repository root, with Node.js 24, npm, Python 3.12, uv and Bun available:

```sh
bun install --frozen-lockfile
node examples/bridges/compatibility-lab/setup.mjs
bun run dev
```

In **Projects → Open existing project**, enter the absolute path to `examples/bridges/compatibility-lab`. Open **Workspace**. The expected catalog is seven tools, two static resources and two prompts. In Inspector, select Streamable HTTP and copy the agent URL from the workspace. A good first call is `get_quote_by_sku` with `{"sku":"ACT-42","quantity":3,"tier":"premium"}`. The result includes a USD 4.49 discount, USD 4.57 tax and a USD 59.93 total.

Setup runs `npm ci` in each Node package, creates an isolated `.venv` for each Python application using `uv sync --locked`, and builds the xmcp entrypoint. The Node adapters have their own package manifest in `bridges/`. Setup does not require credentials. The first run requires internet access to install packages. The setup and test builds disable xmcp telemetry with `XMCP_TELEMETRY_DISABLED=true`; the fulfillment fixture disables Mastra telemetry before loading its SDK.

## What is implemented

| Source | Tool and implementation | What to try |
| --- | --- | --- |
| Native · Node.js | `get_quote_by_sku` loads a seeded SQLite catalog, applies a tier discount and calculates tax with decimal.js 10.6.0. | Request more than 20 units of ACT-42 to see `INSUFFICIENT_STOCK`. |
| Native · Python | `estimate_delivery` uses the dispatch cutoff, holiday calendar and service settings in `native/mcpack.json`. | Use `{"orderedAtLocal":"2026-10-30T16:00","service":"express","parcels":[{"kg":2}]}`. Dispatch is Nov 3 and delivery is Nov 4. |
| FastAPI-MCP 0.4.0 · Python | `preview_return` projects an existing FastAPI route into MCP. The adapter opens an in-memory MCP session. The route checks ownership, return window and quantity before prorating the refund. | Use `{"order_id":"A-100","as_of":"2026-10-20","item":{"units":2,"condition":"opened"}}` for USD 30.59. B-200 belongs to another customer and returns `ORDER_FORBIDDEN`. |
| Standalone FastMCP 3.4.11 · Python | `compare_policy` combines mounted providers and evaluates a basket under two regional policies. The adapter uses FastMCP’s in-process client. | Compare UY with CA for a basket worth 8,000 cents, 20 days after delivery. Inspect the baseline resource and the `explain_policy` prompt. |
| xmcp 1.9.0 · TypeScript | `plan_rollout` discovers dependencies and groups parallel deployments. The adapter connects to the file-based compiler’s stdio output. | With `api` depending on `db`, deploy `db` first. Make `db` depend on `api` to see the cycle path. Rebuild after editing `src/tools`, then reload project sources. |
| Mastra MCP 2.7.0 / core 1.81.0 · JavaScript | `fulfill_order` runs a two-step workflow. The adapter launches the app’s stdio entrypoint and negotiates its supported protocol revision. | Send `{"order":{"id":"F-1","sku":"KIT","units":2},"simulateCarrierFailure":true}`. The workflow restores all eight kits. Repeat the order ID to see `replay: true`. |
| MCP Framework 0.2.22 · JavaScript | `allocate_stock` discovers a warehouse tool, resource and prompt from directories. The adapter calls the public Web Request handler in-process. | Two KIT lines of 10 and 7 units for UY leave a shortage of 2. Read the stock snapshot and use `explain_shortage`. |

Only the policy and warehouse applications publish resources and prompts. The REST application's MCP projection uses the fixture’s synthetic Alice identity. Its direct REST endpoint returns HTTP 401 for an unauthenticated request. The inventory and order journal are process-local. Reloading project sources restores the seed.

## Verify the examples

After setup, run this from the repository root:

```sh
bun test examples/bridges/compatibility-lab/tests/compatibility.test.mjs
```

The suite opens a temporary project copy in Forge, connects a client to its real `/mcp` endpoint and starts independent instances of each application. It compares discovery schemas, MCP content, structured results, error flags, resource reads and prompt messages. It also exercises the returns API directly over HTTP. The test rebuilds the disposable xmcp application with an additional tool, breaks a separate source, and checks that the new tool and the native quote both remain callable. It also checks overlapping fulfillment requests, cancels an in-flight client call and confirms the downstream workflow process exits when the project closes. The cancellation check verifies the caller can stop waiting. A framework handler must cooperate with cancellation to interrupt its own work. Some frameworks log expected rejected orders to stderr.

To run applications independently, use their working directory under `apps/`. Start returns with `uv run --locked uvicorn application:app` (REST and `/mcp`), policy with `uv run --locked python application.py` (stdio), deploy with `node dist/stdio.js`, and fulfillment or warehouse with `node server.mjs`. For a standalone native pack, launch the installed MCPack CLI with `serve` and the path to `native/mcpack.json`.

## Inspector replay

Verified on Linux with Node.js 24.22.1, Python 3.12.14, Bun 1.4.2, uv 0.13.4, MCPack 0.9.0 and Inspector CLI 2.13.0. With the project open, replace the URL if your workspace shows a different port.

```sh
npx --yes @modelcontextprotocol/inspector@2.13.0 --cli http://localhost:5173/mcp --transport http --method tools/list
npx --yes @modelcontextprotocol/inspector@2.13.0 --cli http://localhost:5173/mcp --transport http --method tools/call --tool-name get_quote_by_sku --tool-arg sku=ACT-42 quantity=3 tier=premium
```

The observed catalog contained all seven tool names above. The quote returned `total: "59.93"`. Calling `fulfill_order` with a fresh order ID, KIT, two units and a simulated carrier failure returned `status: "rolled_back"`, `remaining: 8` and `replay: false`.
