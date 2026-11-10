"""Forge's stdio host for project-owned Python adapter modules."""

import asyncio
import importlib.util
import inspect
import sys
from pathlib import Path

from mcp import types
from mcp.server import Server
from mcp.server.stdio import stdio_server


def load_adapter(path, root):
    sys.path[:0] = [str(path.parent), root, str(Path.cwd())]
    spec = importlib.util.spec_from_file_location("forge_project_adapter", path)
    if spec is None or spec.loader is None:
        raise ValueError("Choose a Python adapter module with a .py extension.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def handler(hook, result_type, context, collection=None):
    async def handle(request):
        params = request.params
        payload = params.model_dump(mode="json", by_alias=True, exclude_unset=True) if params else {}
        result = hook(payload, context)
        if inspect.isawaitable(result):
            result = await result
        if collection and isinstance(result, list):
            result = {collection: result}
        return types.ServerResult(result_type.model_validate(result))

    return handle


async def main():
    root = sys.argv[1]
    sys.argv = sys.argv[2:]
    adapter = load_adapter(Path(sys.argv[0]), root)
    server = Server("forge-python-adapter")
    context = {"application_root": root}
    groups = [
        ("tools", "list_tools", types.ListToolsRequest, types.ListToolsResult,
         "call_tool", types.CallToolRequest, types.CallToolResult),
        ("resources", "list_resources", types.ListResourcesRequest, types.ListResourcesResult,
         "read_resource", types.ReadResourceRequest, types.ReadResourceResult),
        ("prompts", "list_prompts", types.ListPromptsRequest, types.ListPromptsResult,
         "get_prompt", types.GetPromptRequest, types.GetPromptResult),
    ]
    enabled = False
    for key, list_name, list_req, list_result, call_name, call_req, call_result in groups:
        list_hook = getattr(adapter, list_name, None)
        call_hook = getattr(adapter, call_name, None)
        if list_hook is None and call_hook is None:
            continue
        if not callable(list_hook) or not callable(call_hook):
            raise TypeError("FORGE_BRIDGE_INVALID_HOOKS: provide both hooks in each capability group.")
        enabled = True
        server.request_handlers[list_req] = handler(list_hook, list_result, context, key)
        server.request_handlers[call_req] = handler(call_hook, call_result, context)
    if not enabled:
        raise TypeError("FORGE_BRIDGE_INVALID_HOOKS: define at least one hook pair.")
    async with stdio_server() as (reader, writer):
        await server.run(reader, writer, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
