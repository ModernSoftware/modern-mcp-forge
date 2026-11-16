from mcp.server.fastmcp import FastMCP

server = FastMCP("shipping")


@server.tool()
def shipping_days(region: str) -> int:
    """Return the example delivery estimate in days."""
    return 2 if region == "local" else 5


@server.resource("shipping://guide", name="guide")
def guide() -> str:
    return "Use local to try the shipping estimate."


@server.prompt()
def review_shipping(region: str) -> str:
    return f"Review shipping for {region}"


if __name__ == "__main__":
    server.run(transport="stdio")
