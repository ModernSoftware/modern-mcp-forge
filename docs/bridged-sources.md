# Bridge an existing implementation

Use a bridge when a developer already has tools, resources or prompts in an application. The application keeps its registrations and handlers. Forge launches a small project-owned adapter that discovers those capabilities and forwards calls to the application. The application can keep using its existing framework and production entrypoint.

## Create the adapter

1. Open **Workspace → Bridge existing implementation**. Select **Wire an existing implementation**, give the source a name and choose Node.js or Python.
2. Choose **Create adapter file**. Forge creates `bridges/<name>/adapter.mjs` or `bridges/<name>/adapter.py`. Open it in your editor. Its discovery hooks initially return empty lists.
3. Wire the hooks to the existing application's registry, factory or dispatcher. Import it once if initialization is expensive. Use the normal dispatcher when you need the same validation, middleware and errors as the production server.
4. Choose **Attach bridge**. To keep a work in progress in Git before its dependencies or application are ready, clear **Start and discover on save** and choose **Save disabled bridge**. Enable it from its connection page when ready.
5. Commit **both** `forge.project.json` and the generated `bridges/<name>/` directory. This keeps the adapter, Python requirement (where applicable) and connection definition together. Generated files are never overwritten.
6. Use **Inspect & test** on a workspace capability or connect Inspector to the workspace’s agent URL. After editing the adapter or application, reload project sources and reconnect clients to rediscover changes.

If the application already serves MCP over stdio, **Launch an existing stdio server** accepts its project-relative startup script. Previous bridge connections continue to use this mode. A running Streamable HTTP endpoint can be attached through **Connect external server**.

## Same repository or separate checkouts

For an application inside the Forge project, leave **Application checkout variable** empty. The application root is the Forge project directory. For a separate repository, enter an environment-variable name such as `ORDERS_CHECKOUT`. Each developer sets its value to the absolute directory of their local checkout in the environment that launches Forge. In Docker, mount that checkout and set the variable to the path inside the container.

For example, the committed source descriptor can contain:

```json
{
  "kind": "bridge",
  "id": "orders",
  "enabled": true,
  "mode": "adapter",
  "runtime": "node",
  "entrypoint": "bridges/orders/adapter.mjs",
  "checkoutEnv": "ORDERS_CHECKOUT",
  "naming": "collisions"
}
```

Forge always loads `entrypoint` from inside the Forge project, including after resolving symlinks. A separate checkout supplies application code and dependencies. Forge does not copy that repository or write the local checkout path to the manifest. Teammates should use a compatible checkout revision. The manifest can contain native sources and external connection descriptors alongside the bridge. Remote implementations and credential values stay with their owners.

The adapter process starts in the application root. An optional working directory is relative to that root. A relative JavaScript import resolves beside the adapter, so use an installed package or import a file URL from the application root for a separate checkout. The Python host includes the application's root and working directory on its module search path.

## Hook contract

The Node adapter exports a default object. The Python adapter defines module-level functions. Implement a discovery and invocation pair for each supported category. Unused pairs may be omitted. Forge supplies the MCP server and calls these hooks.

| MCP operation | Node | Python | Hook result |
| --- | --- | --- | --- |
| tools/list | listTools | list_tools | An array of tool definitions or a tools page |
| tools/call | callTool | call_tool | MCP tool result with content or structuredContent and optional isError |
| resources/list | listResources | list_resources | An array of static resource definitions or a resources page |
| resources/read | readResource | read_resource | A result with contents |
| prompts/list | listPrompts | list_prompts | An array of prompt definitions or a prompts page |
| prompts/get | getPrompt | get_prompt | A result with messages |

Each hook receives MCP request parameters and a context. Discovery may receive a cursor. Return the matching page object with nextCursor for pagination. Tool calls and prompt requests receive name and arguments. Resource reads receive the original uri. Both languages support asynchronous hooks. Node context provides applicationRoot and an AbortSignal. Python context provides application_root, and asynchronous hooks can receive cancellation through their task. Synchronous, blocking application code needs its own timeout.

The [Node example](../examples/bridges/adapters/registry.mjs) maps a plain application's action registry, documents and templates into these hooks. It loads [the application](../examples/bridges/registry/application.mjs) from the working directory. To try it, copy the adapter into your generated Node file and point the checkout variable at `examples/bridges/registry`. Calling `quote` with `{"quantity":2}` returns a total of 24.

The [Python example](../examples/bridges/adapters/fastmcp_adapter.py) imports an existing FastMCP server instance. To try it, copy the adapter into the generated Python file and point the checkout variable at [the example application directory](../examples/bridges/direct-stdio). The adapter uses the server's discovery and call methods. The existing entrypoint can still launch that application independently. These examples live in the Forge source repository.

## Runtime dependencies

Forge ships both host scripts in `runners/bridges/`. Include that directory beside Forge’s package.json when distributing a server build. The Docker image includes it. Forge supplies the Node host’s MCP SDK. Install the application's own dependencies in its checkout. The Python host uses the MCP Python SDK in the selected interpreter, independently of the framework the application uses. Install the generated `requirements-forge.txt` and any application dependencies. An adapter-local `.venv` takes priority, followed by `.venv` in the working directory and Forge's normal Python resolver. To keep the application's environment separate, create `.venv` beside `adapter.py` and install its dependencies there. On Windows use `.venv\Scripts\python.exe -m pip install -r requirements-forge.txt`. On macOS or Linux use `.venv/bin/python -m pip install -r requirements-forge.txt`.

Forge launches the interpreter without a shell. Each optional script argument is passed as one string. The child receives basic OS variables plus names explicitly listed under **Environment variable names**. Keep secrets out of the adapter, arguments and manifest. Project code runs with the local user's permissions. Reserve stdout for MCP and send diagnostics to stderr.

## Naming and lifecycle

Unique names keep their spelling by default. On a collision, use the name shown in the workspace. **Always prefix** keeps names independent of other catalogs. Public resource URIs use `forge-bridge://source/<id>/<encoded-uri>`. Forge maps them back on reads.

Discovery and attachment verify a candidate before saving an enabled connection. A failed preview preserves the saved manifest. Explicitly generated adapter files remain for repair. A failed saved bridge is isolated from healthy sources. Disabling, detaching or closing stops its process. Detaching keeps the adapter files. Discovery has a 30-second deadline and calls have a 20-second timeout. Forge never replays an interrupted write. The adapter owns any child processes it starts.

This version supports tools, listed static resources and prompts. Resource templates, subscriptions, sampling, elicitation and native-pack deployment of bridged code are outside the bridge contract.
