# Deploy a native MCPack source

In **Workspace → Export native pack**, choose an enabled native source. MCPack 0.9.0 serves one manifest per process. A project with several native sources offers a separate download for each. The workspace filters, search, view and expanded source groups are remembered per project for the current browser tab, including after a refresh. They are independent of the export selection.

1. Review the counts of enabled native tools, static resources and prompts. Worker modules used by those capabilities are required.
2. Select helper modules, dependency files and assets used by the workers. Root dependency declarations and files named directly in a worker's configuration are preselected. Dynamic imports, nested package dependencies and paths computed by your code may need manual selection. Review application code and configuration for secrets.
3. Download the archive and extract it into an empty directory. The root contains the pinned MCPack host package, npm lockfile and a README. The pack's rewritten manifest, original module layout, selected files and dependency declarations live under `pack/`. Project and source files on disk stay unchanged.

## Run the compatibility lab export

Choose **order-desk** from the compatibility lab. Include the two worker modules, `catalog.json`, `package.json` and `package-lock.json`. With Node.js 24 and Python 3 available, run the following from the extracted directory.

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
