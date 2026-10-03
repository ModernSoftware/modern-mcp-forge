# Native authoring in a Forge project

Forge uses the published `@modern-software/mcpack@0.9.0` runtime for native sources.
Your project owns the MCPack manifests and handler modules: the same files can run
with the standalone MCPack CLI without Forge.

## Try it

1. Create or open a project from **Projects**. The recent list is searchable by name or folder; the active project has a green indicator.
2. In **Project workspace**, choose **Add capability** and select Tool, Resource or Prompt with **Native MCPack** as its implementation.
3. Create a source and choose Node/Python, or select an existing source and create/reuse a worker. Reusing a worker requires the name of a handler already returned by its factory. Forge does not rewrite existing handler code.
4. Edit the name, description and definition. Tool inputs support a simple-field builder or full JSON Schema. Applying simple fields explicitly replaces the schema draft; it never silently flattens a complex schema.
5. Choose **Edit code & test**, open the worker module, implement your behavior and save. The generated tool initially accepts `{"name":"Diego"}` and returns a greeting; replace this example with your own implementation.
6. Connect Inspector or an agent to `http://localhost:5173/mcp`. Reconnect after changing or restarting sources.

The workspace lists all native capability types and supports searching, filtering,
and disabling individual capabilities. **Configuration** lists source controls,
worker definitions and links to the same capability editors. Attach an existing
MCPack manifest there instead of creating a new source.

The old standalone preview is retired: `/mcpack` redirects to Projects and its API
returns 410. A project must be open to serve MCP. Closing stops sources and protects
unsaved edits; reopening starts the configured sources again.

## Files and definitions

New sources live under `native/<source-id>/` with a manifest and worker module.
Creation exposes only the capability you chose. Generated factories contain example
handlers for all three kinds, so you can reuse a worker for later capabilities.
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

The creation form can generate additional workers. For custom worker configuration,
edit MCPack's manifest and create any referenced module files in your repository. This release edits manifests and declared
worker modules only. Folder exploration, arbitrary file creation and automatic
compilation are later work. A shared worker module may implement many capabilities.

## Lifecycle and errors

- File revisions prevent overwriting external changes; conflicts return 409. Files
  are replaced atomically and have a 256 KiB editor limit.
- Saving/reloading restarts all project sources and discards worker memory. Schema
  and path failures reject the save. Runtime validation failures retain saved work
  and show startup errors, allowing repair.
- Disabling a capability hides it from discovery and rejects direct Forge calls; it does not stop its shared worker. This exposure preference lives in the Forge source descriptor, not the deployment manifest. Enable a disabled capability before renaming it.
- Disabling a source keeps an editable descriptor without executing it. Detach removes only
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

Existing classic handlers keep their ABI and are not automatically converted. The
workspace explicitly identifies legacy definitions and links to their older views.
New authoring starts with native MCPack; old routes remain for deliberate migration.
Execution history currently records classic runs only; native test results remain
in the source test panel. Worker listings are configuration, not live telemetry.
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
