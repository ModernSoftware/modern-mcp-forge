"""Wire the existing FastMCP application in direct-stdio/server.py."""

from base64 import b64encode

from server import server


async def list_tools(params, context):
    return await server.list_tools()


async def call_tool(params, context):
    value = await server.call_tool(params["name"], params.get("arguments", {}))
    if isinstance(value, tuple):
        content, structured = value
        return {"content": content, "structuredContent": structured}
    if isinstance(value, list):
        return {"content": value}
    return value


async def list_resources(params, context):
    return await server.list_resources()


async def read_resource(params, context):
    uri = params["uri"]
    contents = []
    for item in await server.read_resource(uri):
        data = {"uri": uri, "mimeType": item.mime_type}
        if isinstance(item.content, bytes):
            data["blob"] = b64encode(item.content).decode("ascii")
        else:
            data["text"] = item.content
        contents.append(data)
    return {"contents": contents}


async def list_prompts(params, context):
    return await server.list_prompts()


async def get_prompt(params, context):
    return await server.get_prompt(params["name"], params.get("arguments", {}))
