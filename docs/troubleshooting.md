# Troubleshooting

Record the Forge commit/version, OS, source kind and sanitized error. Start with
`bun run runtime:check` and the failing source's configuration. Do not include
credentials or real customer data in reports.

| Symptom | Check and recovery |
| --- | --- |
| `/mcp` returns 503 | Open/continue a project and start its sources. Closing intentionally disables the interactive endpoint. |
| Project appears selected after restart, but tools are missing | Refresh the working tab or choose **Continue**/**Start project sources**, then reconnect the client. |
| Missing npm module after updating Forge | Restart `bun run dev` from the repository; it checks the frozen lockfile. Install application/adapter dependencies separately. |
| Python cannot import `mcp` | Install the bridge's `requirements-forge.txt` in the interpreter Forge selects. Check adapter-local and cwd `.venv` priority. |
| Application module cannot be imported | Check entrypoint, checkout variable, cwd and module resolution in the [bridge guide](bridged-sources.md#precisely-what-cwd-means). Node relative imports resolve beside the module. |
| Incomplete Python `.venv` | Recreate that environment using the matching platform/interpreter and install its declared dependencies. |
| External HTTP 401/403 | Check that the raw access token belongs to that server and is valid. Set it before starting Forge in the same environment; enter only the variable name in the UI. |
| Environment variable echoes in a shell but Forge cannot see it | Stop Forge and start it from that shell. Existing processes and containers do not inherit later shell changes. |
| New connection fails | Correct or cancel the draft. A failed enabled preview does not replace the saved configuration. Generated adapter files remain for repair. |
| Previously saved source fails | Manage it to correct settings or disable it, then reload. Healthy sources remain available. |
| Sources changed after IDE edits | Save the files, reload project sources and reconnect the MCP client. Reload discards worker memory. |
| Save returns revision conflict/409 | Reload current contents and reconcile your draft; another editor or request changed the file. |
| Agent sees old names/hidden tools | Reconnect and rediscover after exposure changes. Check the public catalog; upstream tester names intentionally stay original. |
| Duplicate name or resource URI | Rename/disable conflicting native definitions, change upstream naming policy or choose a distinct public alias. |
| Form unavailable for a schema | Use JSON. Complex unions/references can exceed form support while remaining valid server schemas. |
| Populate sample fails | Supply arguments manually or publish valid examples in the schema. Not every schema can be satisfied by the generator. |
| Case blocked after schema change | Review arguments/assertions in the tester and save again. Do not change the stored hash manually. |
| Case expected a tool error but failed | Authentication, transport failures and crashes are not MCP business errors. Inspect the invocation failure. |
| Stop batch does not stop current call | **Stop after current case** only stops the queue. Verify upstream side effects before retrying. |
| Export works locally but fails elsewhere | Install source dependencies, select dynamic helpers/assets, set deployment variables and use compatible runtimes/paths. Follow the generated README. |
| Files/interpreters missing in Docker | Use mounted container paths, explicit environment values and Linux-compatible dependencies. Host `.venv` and native modules may be incompatible. |

Source operations report configured runtime state, not fine-grained worker
telemetry. For timeouts or lost connections, the operation may already have
changed data. Forge does not automatically retry failed writes.
