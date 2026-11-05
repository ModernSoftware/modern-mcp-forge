# Project workflow

Start with the [developer guide](developer-guide.md) for a complete walkthrough.

## Create, open and resume

A project is a developer-owned directory containing `forge.project.json`. Create
one from **Projects**, or open an existing folder. Search recent projects by name
or path. Only one project supplies the interactive `/mcp` endpoint at a time.
Switching stops the previous sources. Closing protects unsaved drafts, stops
sources and makes `/mcp` unavailable (HTTP 503).

After restarting Forge, refresh the working tab to restore its selected project
and sources. **Continue** resumes a registered project. A bookmark in a fresh tab
may offer **Start project sources**. Forget removes local registration, not files.
A missing folder remains identifiable so you can restore or reopen it.

## Work in the workspace

- Create native tools, resources and prompts with the **Add** actions.
- **Bridge existing implementation** attaches an adapter or local stdio server.
- **Connect external server** attaches a Streamable HTTP endpoint.
- Search names, descriptions and sources. Combine capability/source-type filters,
  switch views and expand source groups. Settings persist per project in the
  current browser tab, including after refresh.
- **Configuration** manages source definitions, native manifests and advanced
  project JSON. Source controls do not represent individual-worker telemetry.
- **Named test cases** opens the project-wide explorer. **Execution history**
  records tool invocations and their origin.

## Edit and recover

Native items keep Definition, Code and Test together. New native creation starts
and discovers the source automatically. Save code changes and reload as prompted.
IDE edits require **Reload project sources**. Reload restarts all enabled sources,
loses process-local memory and does not retry interrupted calls.

Enabled bridge/external attachments are verified before saving. A failed draft
can be corrected or cancelled without replacing the saved connection. Generated
adapter files remain on disk. Empty, disabled and failed sources stay manageable.
Healthy sources remain usable when another source fails.

Revision checks protect externally edited files. Reload current contents and
reconcile your draft on conflict. Detaching retains implementation files.
Disabling keeps a source descriptor without executing it.

## Connect and deploy

Use the workspace agent URL in Inspector or an MCP client. Reconnect after
catalog/exposure changes. See [agent exposure](agent-exposure.md) and
[stdio](mcp-stdio.md) for client-launched sessions.

[Export native pack](native-deployment.md) deploys one native source with MCPack.
Bridges and external connections are not bundled. Existing classic projects
remain supported; new authoring uses MCPack. See
[legacy compatibility](legacy-compatibility.md) for migration.
