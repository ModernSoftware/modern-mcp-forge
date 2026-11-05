"""Composable regional policy service, runnable directly over MCP stdio."""
from fastmcp import FastMCP
from pydantic import BaseModel, Field

catalog = FastMCP("Policy data")
rules = FastMCP("Policy evaluator")
POLICIES = {"global": {"returnDays": 14, "freeShippingCents": 7500},
            "UY": {"returnDays": 30}, "CA": {"freeShippingCents": 10000}}


class Basket(BaseModel):
    subtotal_cents: int = Field(ge=0)
    days_since_delivery: int = Field(ge=0)


def resolve(region):
    if region not in POLICIES:
        raise ValueError("UNKNOWN_REGION")
    return {**POLICIES["global"], **POLICIES[region]}


@rules.tool
def compare_policy(region: str, other_region: str, basket: Basket) -> dict:
    """Compare the effective policies and decisions for a specific basket."""
    def evaluate(code):
        policy = resolve(code)
        return {"region": code, "policy": policy,
                "returnEligible": basket.days_since_delivery <= policy["returnDays"],
                "freeShipping": basket.subtotal_cents >= policy["freeShippingCents"]}
    return {"version": "2026-10", "first": evaluate(region), "second": evaluate(other_region)}


@catalog.resource("policy://baseline/2026-10")
def baseline() -> dict:
    return POLICIES["global"]


@catalog.prompt
def explain_policy(region: str) -> str:
    return f"Explain how the {region} overrides affect the 2026-10 baseline."


server = FastMCP("Regional policy desk")
server.mount(catalog)
server.mount(rules)

if __name__ == "__main__":
    server.run(transport="stdio", show_banner=False)
