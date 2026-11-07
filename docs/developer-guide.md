# Modern MCP Forge 0.10.0 developer guide

Forge is a local workbench for building, connecting and testing MCP tools,
static resources and prompts. It publishes the open project's capabilities at
one MCP endpoint. Native sources use `@modern-software/mcpack@0.9.0` from npm;
Forge and MCPack have independent version numbers.

## Contents

- [Install and start](#install-and-start)
- [Choose an implementation](#choose-an-implementation)
- [Create your first native tool](#create-your-first-native-tool)
- [Organize complex implementations](#organize-complex-implementations)
- [Resources and prompts](#resources-and-prompts)
- [Bridge existing applications](#bridge-existing-applications)
- [Connect external servers](#connect-external-servers)
- [Test arguments and results](#test-arguments-and-results)
- [Save repeatable test cases](#save-repeatable-test-cases)
- [Control what agents see](#control-what-agents-see)
- [Reload, diagnose and collaborate](#reload-diagnose-and-collaborate)
- [Export and deploy](#export-and-deploy)
- [Supported boundaries](#supported-boundaries)

## Install and start

Use Bun as pinned by `packageManager` in [package.json](../package.json), Node.js
22 or newer, and Python 3.11 or newer if using Python workers/adapters. The optional
[five-framework lab](../examples/bridges/compatibility-lab/README.md) has its own
requirements: Node 24, Python 3.12 and uv.

For the 0.10.0 rehearsal:

```sh
git clone --branch v0.10.0 https://github.com/ModernSoftware/modern-mcp-forge.git
cd modern-mcp-forge
bun install --frozen-lockfile
bun run dev
```

Before a release tag exists, `v0.10.0` is a development branch, not a published
release. Record `git rev-parse HEAD` when reporting a rehearsal result. After
publication, use the release tag for a reproducible installation.

Open the URL Vite prints (normally `http://localhost:5173`). Create a project in
a folder you own from **Projects**, or open a folder containing
`forge.project.json`. Do not create projects inside Forge's `node_modules`.
Run `bun run runtime:check` if a runtime is not detected.

`bun run dev` checks Forge's frozen lockfile before startup. Your tools and
adapters own separate dependencies and environments; installing Forge does not
install those. With [Docker](docker.md), project paths and interpreters refer
to locations inside the container.

## Choose an implementation

| Source | Use it when | Implementation owner | Native export |
| --- | --- | --- | --- |
| Native MCPack | Authoring capabilities for standalone deployment | Your manifest and Node/Python modules | One source per archive |
| Bridge adapter | An application exposes a registry, dispatcher or framework API | Application plus a project-owned adapter | No |
| Bridge stdio | A local server already speaks MCP over stdio | Existing server entrypoint | No |
| External HTTP | A server runs at a Streamable HTTP MCP URL | Remote service | No |

![An MCP client connects to Forge. Forge routes native calls through MCPack workers, bridged calls through an adapter to the application, and external calls to the HTTP server.](images/project-sources.svg)

A project can mix these sources. Source IDs are unique within the project.
Native definitions own their published identities; bridge/external definitions
retain upstream identities and can have local exposure overrides.

## Create your first native tool

1. Choose **Add tool**. Enter `greet_customer`, a description, a new native source
   ID such as `customer-tools`, and the Node runtime.
2. Click **Create tool**. Forge creates a placeholder handler and opens its
   editor. On **Definition**, add a string field named `name`, turn on
   **Required**, enter **Minimum length** `1`, and click **Save definition**.
   Required checks that the property is present. Minimum length also rejects an
   empty string. **Edit as JSON** shows the corresponding schema:

   ```json
   {
     "type": "object",
     "properties": { "name": { "type": "string", "minLength": 1 } },
     "required": ["name"],
     "additionalProperties": false
   }
   ```

3. The project-level `forge.project.json` registers sources. Its top-level
   tools, resources and prompts arrays support classic projects. The native
   workers and their handler bindings are in `native/customer-tools/mcpack.json`.
4. In **Code**, implement the handler:

   ```js
   export function createWorker(context) {
     return {
       tools: {
         async greet_customer({ name }, call) {
           call.signal.throwIfAborted();
           return {
             content: [{ type: 'text', text: `Hello, ${name}!` }],
             structuredContent: { greeting: `Hello, ${name}!` }
           };
         }
       }
     };
   }
   ```

5. Save and reload as prompted. In **Test**, enter a name and run it. Check
   Preview and Raw JSON.
6. Connect Inspector to the workspace's `/mcp` URL. Discover and call the same
   tool. Execution history labels MCP client calls, one-off workbench tests and named test case calls.

The manifest binding connects the public tool name to a worker and handler:

```json
{
  "name": "greet_customer",
  "worker": "main",
  "handler": "greet_customer",
  "inputSchema": {
    "type": "object",
    "properties": { "name": { "type": "string", "minLength": 1 } },
    "required": ["name"],
    "additionalProperties": false
  }
}
```

This is one tool entry, not a complete manifest. Start with the generated
manifest. To add a second tool named `greet_customer_py` to the same source,
select a new Python worker at creation. Match the handler key shown above the
Code editor. For the `greet_customer_py` binding, use:

```python
def create_worker(context):
    def greet_customer_py(args, call):
        call.signal.throw_if_aborted()
        greeting = f"Hello, {args['name']}!"
        return {
            "content": [{"type": "text", "text": greeting}],
            "structuredContent": {"greeting": greeting},
        }
    return {"tools": {"greet_customer_py": greet_customer_py}}
```

See [native authoring](native-authoring.md) for existing-worker bindings,
manifest editing, validation and file limits.

## Organize complex implementations

The factory is an integration boundary, not a requirement to put all business
logic in one function. Import services, repositories and helpers from other
modules. Initialize shared clients once in `createWorker`/`create_worker` and
return handlers that delegate to those services. A Node factory can return a
`close` hook to release shared resources.

The [quote worker](../examples/bridges/compatibility-lab/native/quote.mjs) creates
a SQLite catalog once, uses `decimal.js`, returns business errors and closes
its database. The [shipping worker](../examples/bridges/compatibility-lab/native/shipping.py)
uses Python calendar logic and configuration from the
[manifest](../examples/bridges/compatibility-lab/native/mcpack.json).

| Concern | Location |
| --- | --- |
| Public schema and worker binding | MCPack manifest |
| Business logic and helpers | Source directory, edited in your IDE |
| Node dependencies | Source's `package.json` and lockfile |
| Python dependencies | Requirements/project file and selected environment |
| Non-secret settings | Worker `config` in the MCPack manifest |
| Credentials | Process environment and explicit worker `inheritEnv` names |
| Durable business data | Your database or persistent storage |

Workers stay alive between calls, but lose memory on reload, shutdown or failure.
Process persistence is not durable storage. Compile TypeScript before pointing a
native worker at emitted JavaScript. Forge edits declared modules and manifests;
use your IDE for helpers, folders and dependency installation.

## Resources and prompts

Choose **Add resource** for a static URI such as `support://guide`. Bind a handler
returning `contents`, with each entry carrying a URI and text or blob. Choose
**Add prompt** for named messages. Declare argument names and required status;
MCP prompt argument values are strings.

Inside a Node worker's returned object, the shapes are:

```js
resources: {
  async guide({ uri }) {
    return { contents: [{ uri, mimeType: 'text/plain', text: 'Support guide' }] };
  }
},
prompts: {
  async review({ topic }) {
    return { messages: [
      { role: 'user', content: { type: 'text', text: `Review ${topic}` } }
    ] };
  }
}
```

Bind `guide` and `review` in the manifest; defining functions alone does not
publish them. Read resources and retrieve prompts in Test or an MCP client.
These operations do not create tool history records. Named cases currently
apply to tools only.

## Bridge existing applications

If an application serves MCP over HTTP, connect it externally. If it has a stdio
entrypoint, select that bridge mode. Otherwise create a Node/Python adapter that
maps Forge's hooks to its public registry or dispatcher. Forge owns the adapter
host; the developer keeps the application's existing workflow and entrypoint.

The [bridge guide](bridged-sources.md) explains hooks, dependency ownership,
`entrypoint`, `checkoutEnv`, `cwd`, module resolution and cancellation. `cwd` is
the process working directory. It is not a per-tool sandbox and does not make
Node imports resolve from that folder.

The [compatibility lab](../examples/bridges/compatibility-lab/README.md) integrates
FastAPI-MCP, standalone FastMCP, xmcp, Mastra and MCP Framework. Its `client.mjs`
helper is example-specific wiring, not a mandatory Forge API or universal
framework dispatcher.

## Connect external servers

Choose **Connect external server**, enter a name and Streamable HTTP URL, and
choose no authentication or a bearer-token environment-variable name. Set the
raw token in the environment that launches Forge, then restart Forge. Enter
only the variable name in the UI; Forge adds the `Bearer ` prefix.

Enabled connections are discovered before saving. Cancel or correct failed
drafts. **Manage connection** repairs, disables or removes saved sources. An
unavailable upstream leaves healthy sources usable. See
[external connections](external-sources.md) for cross-platform environment setup,
authentication diagnostics, naming and protocol limits.

## Test arguments and results

The tester uses the running tool's schema for native, bridged and external tools.
Forms support strings, numbers, booleans, enums, objects and arrays within the
supported schema subset. Omit optional properties rather than sending empty values.

**Edit as JSON** edits the same arguments. Valid values survive switching modes.
Incomplete JSON stays editable and disables Run. Unsupported form constructs
fall back to JSON; the tool itself can still run. If local validation is
unavailable, the tester explains that validation is left to the server.

**Populate sample** generates a schema-checked starting object, using valid
published examples where possible. It asks before replacing existing input.
Generation can fail for a schema it cannot satisfy. Sample values do not prove
that a SKU, account or URL exists. Review them before execution.

**Preview** displays structured content, text and supported inline images.
**Raw JSON** shows the complete highlighted MCP result, including metadata and
encoded image data. No output schema is required for preview; it presents data
rather than validating business correctness.

## Save repeatable test cases

Use **Named test cases → Save as case** in a tool's tester. Store arguments, an
expected result mode and exact JSON Pointer assertions. For example, the lab
quote can assert `/structuredContent/total` equals the string `"59.93"`.

**Workspace → Named test cases** filters, selects and runs cases across sources.
Batches are sequential; **Stop after current case** stops the queue after the
active request. Commit `forge.cases.json`; verdicts and timestamps stay in local
SQLite. Read [named test cases](named-test-cases.md) for expected errors, invalid
input, schema drift, hidden tools and reliability limits.

## Control what agents see

For bridge/external items, open **Manage bridge/connection → Discovered catalog →
Agent exposure**. Set a public alias, override a description or turn off
**Expose to agents**. Upstream code and schemas stay unchanged. Local testers
continue using original identities, including hidden items.

Native items use their definitions and enable/disable controls. Hidden/disabled
items are omitted from public discovery and direct Forge invocation is rejected.
Reconnect clients after exposure changes. See [agent exposure](agent-exposure.md)
for collisions and resource URIs.

## Reload, diagnose and collaborate

Use **Reload project sources** after IDE edits. It restarts enabled sources,
refreshes catalogs and invalidates stale requests. Save connection settings
before reloading. Restarts discard process-local state and do not retry calls.
Failed sources remain visible for repair.

Execution history records tool arguments, results, status and origin. Inspect
source configuration for startup errors. A revision conflict means a file
changed since the editor read it; reconcile it before saving. See
[troubleshooting](troubleshooting.md).

Commit manifests, cases, modules, adapters, dependency lockfiles and assets.
Exclude installed packages, virtual environments, builds, credentials and local
databases. Separate application checkouts keep their own source control: document
a compatible revision and a `checkoutEnv` variable. See
[application data](app-data.md) for local state and backups, and
[project workflow](project-workflow.md) for open/close/forget and view persistence.

## Export and deploy

**Export native pack** selects one enabled native source. Choose capabilities
and review deployment files. Add helpers/assets loaded dynamically; static
analysis cannot discover every runtime file. Extract into a clean directory,
install dependencies, validate and run independently of Forge.

The archive contains a pinned MCPack host, rewritten pack manifest, selected
files, dependency declarations and instructions. It excludes Forge, installed
dependencies, named cases, bridges and external sources. Worker environment
literals become inherited-variable references; supply values on the deployment
host. Review code/configuration for embedded secrets.
[Native deployment](native-deployment.md) covers HTTP, stdio and listener settings.

## Supported boundaries

This release supports native Node/Python, Node/Python bridges, static resources,
prompts and external Streamable HTTP. Full OAuth login/refresh, .NET/Go workers,
a visual dependency manager, resource templates/subscriptions, server-initiated
sampling/elicitation and combined external-source deployment are not implemented.
Source controls are not individual-worker controls. Catalog changes require
rediscovery; upstream notifications are not relayed automatically.

Forge executes trusted code with the user's permissions. It is not a sandbox
or a multi-user production gateway. Exposure customizes a shared catalog, not
per-user authorization. Read the [security model](security.md) and use the
[release rehearsal checklist](release-checklist.md) for acceptance.
