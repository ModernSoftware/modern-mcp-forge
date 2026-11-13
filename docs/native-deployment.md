# Deploy a native MCPack source

In **Workspace → Export native pack**, choose an enabled native source. MCPack 0.9.1 serves one manifest per process. A project with several native sources offers a separate download for each. The workspace filters, search, view and expanded source groups are remembered per project for the current browser tab, including after a refresh. They are independent of the export selection.

1. Under **Capabilities to include**, choose the tools, static resources and prompts you want clients to discover. All enabled capabilities start selected. The selection applies only to this download.
2. Open **Review deployment files** to see the worker modules, root dependency manifests and lockfiles, and files named directly in the selected workers’ configuration. Forge includes them automatically. Under **Additional files**, select helpers, nested dependencies or assets your code loads dynamically. Including a file cannot enable a tool. Review application code and configuration for secrets.
3. Download the archive and extract it into an empty directory. The root contains the pinned MCPack host package, npm lockfile and a README. The pack's rewritten manifest, original module layout, selected files and dependency declarations live under `pack/`. Project and source files on disk stay unchanged.

## Run the compatibility lab export

Choose **order-desk** from the compatibility lab. Select both tools for the walkthrough below. To deploy shipping alone, select only `estimate_delivery`. The archive then contains `shipping.py` and the package files, and the deployed server lists one tool. With Node.js 24 and Python 3 available, run the following from the extracted directory.

```sh
npm ci
npm ci --prefix pack
npm run validate
npm start
```

Connect Inspector over Streamable HTTP to `http://127.0.0.1:3000/mcp`. Run `get_quote_by_sku` with `{"sku":"ACT-42","quantity":3,"tier":"premium"}` for USD 59.93. Run `estimate_delivery` with `{"orderedAtLocal":"2026-10-30T16:00","service":"express","parcels":[{"kg":2}]}` for delivery on November 4. A stdio client can launch `npm run --silent start:stdio` in the extracted directory.

## Deployment settings

Run the service under your process manager. For a network listener, set a strong `MCPACK_HTTP_TOKEN` in the service environment, configure TLS at your reverse proxy and pass the public hostname to MCPack.

```sh
npm start -- --host 0.0.0.0 --port 3000 --allow-host mcp.example.com --token-env MCPACK_HTTP_TOKEN
```

Clients send the token in the Authorization bearer header. For browser clients, configure the permitted origin with the CLI's `--allow-origin` option as needed. The generated README includes the worker environment-variable names. Worker `env` literals become `inheritEnv` references. Set their values on the deployment host. Custom worker configuration and selected files are copied as supplied. For Python dependencies, install the project's dependencies and activate its deployment environment. Machine-specific interpreter paths use the target platform's default Python.

## Export boundaries

- Disabling a capability removes its binding from the exported manifest. Workers with no remaining bindings are omitted. Code shared by multiple handlers remains in its original module.
- Bridge connections, remote descriptors, Forge settings, installed dependencies, hidden files, private-key files and symlinks are excluded. Review the file list if source and application directories overlap. The selection is limited to regular files inside the pack directory, 32 MiB combined, with up to 2,048 entries scanned.
- Deployment of external sources behind the same endpoint is tracked in [issue #23](https://github.com/ModernSoftware/modern-mcp-forge/issues/23). The proposed gateway reads the production URL and bearer token from separate environment variables. The current export serves native capabilities.


## Rehearsal acceptance

Run the archive outside the original project and stop Forge while testing it.
Verify the chosen catalog, each selected capability type, a business failure and
required environment values. Do not copy `node_modules` or a host virtual
environment to another platform. The archive's MCPack dependency remains 0.9.1;
its application package version is independent of Forge 0.10.0.

The basic host requires Node 22+, but application code can require a newer
runtime (the compatibility lab uses Node 24). Python must be installed on the
deployment host for Python workers. The export is not a container or a dependency
installer. Use the generated README and review [security boundaries](security.md).
