# Agent exposure and public identities

Exposure controls choose which capabilities a Forge project advertises and
which public names/descriptions agents receive. They do not edit upstream
implementations or establish per-user authorization.

## Native capabilities

Use **Disable/Enable** on a native tool, resource or prompt. The disabled item
is omitted from public discovery and direct invocation through Forge is rejected.
A shared worker keeps running for other bindings. The setting lives in the
source's `disabledCapabilities` array, separate from its MCPack manifest.

Native names/descriptions belong to native definitions. Edit the definition to
change them; bridge/external alias rules do not apply to native sources.
Native export starts from enabled capabilities and lets you choose the subset
for that download, applying it to a copy of the manifest.

## Bridged and external capabilities

1. Open **Manage bridge** or **Manage connection**.
2. Under **Discovered catalog**, expand an item's **Agent exposure**.
3. Set a public alias or local description, or turn off **Expose to agents**.
4. Save and reconnect the MCP client so it rediscovers the catalog.
5. Use **Restore upstream defaults** to remove the local rule.

Hidden items remain in the local tester with their original identity/schema.
Hiding affects both public discovery and public invocation; a client cannot
bypass it by guessing the old name. Named tool cases can still exercise hidden
upstream tools locally.

| Item | Rule identity | What an alias changes |
| --- | --- | --- |
| Tool | Exact original tool name | Published tool name |
| Prompt | Exact original prompt name | Published prompt name |
| Static resource | Exact original URI | Display name, not routing URI |

An exposure entry inside a bridge/external source looks like:

```json
{
  "kind": "tools",
  "identity": "lookup",
  "alias": "lookup_order",
  "description": "Look up an order by its identifier.",
  "hidden": false
}
```

This is an entry in `exposure`, not a complete project manifest. Aliases allow
1–64 letters, digits, dots, underscores and hyphens. Descriptions can contain
up to 16,000 characters. Values are committed with `forge.project.json`.
If upstream removes/renames a capability, its old rule remains visible for review.
Restore it to defaults or update the intended item; it is not silently reassigned.

## Naming collisions and URIs

New connections default to **Prefix only colliding names**. Unique upstream
names keep their spelling; collisions use qualified names such as `orders__lookup`.
**Always prefix with connection name** makes public names independent of other
catalogs. Older external descriptors without a `naming` setting keep always-prefix
behavior; bridge defaults are collision-only.

Tools, resources and prompts have separate name spaces. Conflicting fixed
aliases are rejected before saving. Native/classic name conflicts are surfaced;
Forge does not silently replace a handler. Use the public name shown by Forge
rather than constructing names yourself.

Public upstream resource URIs are source-scoped:

```text
forge-external://source/<id>/<encoded-original-uri>
forge-bridge://source/<id>/<encoded-original-uri>
```

Forge routes reads to the original URI. Recognized resource links and embedded
resources are translated to this namespace; arbitrary text and structured data
are not rewritten. An alias for a resource does not change its URI.

## Scope

Descriptions and aliases customize the agent catalog, not input validation.
Schemas, implementations and upstream credentials stay with their source.
Each external connection uses its configured credential; callers do not receive
separate upstream identities. Forge does not relay automatic list-change
notifications. Reconnect after changing names, visibility or source membership.
