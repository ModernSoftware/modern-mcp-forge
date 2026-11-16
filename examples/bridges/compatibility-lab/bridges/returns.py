"""Forward to FastAPI-MCP's actual server over an in-memory SDK session."""
from mcp.shared.memory import create_connected_server_and_client_session
from application import mcp


async def list_tools(params, context):
    async with create_connected_server_and_client_session(mcp.server) as client:
        return await client.list_tools(cursor=params.get("cursor"))


async def call_tool(params, context):
    async with create_connected_server_and_client_session(mcp.server) as client:
        return await client.call_tool(params["name"], params.get("arguments", {}))
