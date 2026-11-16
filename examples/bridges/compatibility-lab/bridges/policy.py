"""Use standalone FastMCP's public in-process client and raw MCP results."""
from fastmcp import Client
from application import server


async def list_tools(params, context):
    async with Client(server) as client:
        return await client.session.list_tools(cursor=params.get("cursor"))


async def call_tool(params, context):
    async with Client(server) as client:
        return await client.session.call_tool(params["name"], params.get("arguments", {}))


async def list_resources(params, context):
    async with Client(server) as client:
        return await client.session.list_resources(cursor=params.get("cursor"))


async def read_resource(params, context):
    async with Client(server) as client:
        return await client.session.read_resource(params["uri"])


async def list_prompts(params, context):
    async with Client(server) as client:
        return await client.session.list_prompts(cursor=params.get("cursor"))


async def get_prompt(params, context):
    async with Client(server) as client:
        return await client.session.get_prompt(params["name"], params.get("arguments", {}))
