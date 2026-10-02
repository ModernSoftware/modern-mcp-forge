# Native authoring in a Forge project

Forge uses the published `@modern-software/mcpack@0.9.0` runtime for native sources.
Your project owns the MCPack manifests and handler modules: the same files can run
with the standalone MCPack CLI without Forge.

## Try it

1. Open or create a normal Forge project, then open **Project**.
2. Under **Native MCPack**, choose **Create starter**, enter an ID such as `support`,
   and choose Node or Python. Adding the source starts its local code.
3. Open **Edit & test**, select the worker module, change the greeting, and choose
   **Save and restart sources**.
4. In the test panel, choose `support_greet` and run `{"name":"Diego"}`. Also try
   reading `support_guide` and rendering `support_welcome`.
5. Connect Inspector or an agent to `http://localhost:5173/mcp`. Classic and native
   capabilities share the endpoint. Reconnect after changing or restarting sources.

The Tools, Resources and Prompts pages link to native editing alongside the classic
editors. **Project → Add native source** is the native creation entry point; the
original Add tool/resource/prompt buttons still create classic declarations.
The standalone Native MCPack preview remains available for manifests outside a
Forge project and selects its own endpoint instead.

## Files and definitions

Starters live under `native/<source-id>/` with a manifest and worker module. Each
includes a tool, resource and prompt. Public starter names include the source ID.
Node workers use JavaScript modules; compile TypeScript yourself and point the
manifest at its output. Python uses the executable configured in the manifest,
defaulting to `python`. Forge does not install handler dependencies.

Attach existing code with a manifest path relative to the Forge project. Its worker
modules must remain inside the manifest folder, including through symlinks.

Select the manifest to add bindings with the form or edit its complete JSON in
Monaco. Tool inputs support simple string/number/boolean fields or full JSON Schema
with nested objects and arrays. Existing schemas are never flattened. Resource URIs
and prompt arguments are editable in JSON. **Add to draft** changes only the editor
buffer. Implement the named handler in its worker module and save the files.
Incomplete handlers may fail startup; the files stay editable for repair.

Extra workers use MCPack's manifest contract. Create their module files in your
repository before referencing them. This release edits manifests and declared
worker modules only. Folder exploration, arbitrary file creation and automatic
compilation are later work. A shared worker module may implement many capabilities.

## Lifecycle and errors

- File revisions prevent overwriting external changes; conflicts return 409. Files
  are replaced atomically and have a 256 KiB editor limit.
- Saving/reloading restarts all project sources and discards worker memory. Schema
  and path failures reject the save. Runtime validation failures retain saved work
  and show startup errors, allowing repair.
- Disable keeps an editable descriptor without executing it. Detach removes only
  the descriptor and retains every file. Attach can reuse those files later.
- Calls include project identity and generation. Switching/reloading invalidates
  obsolete calls and results. Side effects may already have occurred; Forge never
  automatically retries operations.
- MCPack validates nested tool inputs. Prompt values must be strings. Tests execute
  real trusted handlers and their configured environment; workers are not sandboxes.

Duplicate tool/prompt names, resource names, or resource URIs across enabled native
and classic capabilities prevent construction of the combined endpoint. Project
shows the collision. Rename the declaration or disable/detach a source. Forge does
not silently rename or shadow names. Source-specific testing remains available.

## Compatibility and scope

Classic handlers keep their existing ABI and are not automatically converted.
To migrate deliberately, create a native definition, port its handler signature and
result format, test it, then disable the old classic definition. Existing classic
files are not directly deployable with MCPack merely by attaching them.

MCPack deployment remains native-only. External/bridge adapters, OAuth, export and
folder editing are later steps. The management API uses Forge's existing local
Host/Origin guards. Keep the authoring service on your local development machine.

## Verification

Tests cover creation and attachment, retained files after detachment, conflicts,
size limits, symlink containment, malformed-manifest repair, collisions and config
drift. Real HTTP tests exercise Node/Python tools, resources and prompts alongside
classic resources, schema fidelity and validation, stale generations, source
restarts and recovery after a deliberately broken handler.
