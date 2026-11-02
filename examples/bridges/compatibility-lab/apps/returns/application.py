"""Existing returns API and its FastAPI-MCP projection. No Forge imports."""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated, Literal

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi_mcp import FastApiMCP
from pydantic import BaseModel, Field

app = FastAPI(title="Returns desk")
# Disposable demo principal. This credential is valid only inside this fixture.
DEMO_HEADER = {"Authorization": "Bearer demo-alice"}
ORDERS = {
    "A-100": {"owner": "alice", "delivered": date(2026, 10, 10), "units": 3, "paid": Decimal("53.99")},
    "B-200": {"owner": "bob", "delivered": date(2026, 10, 10), "units": 2, "paid": Decimal("35.00")},
}


class ReturnItem(BaseModel):
    units: int = Field(ge=1, le=100)
    condition: Literal["sealed", "opened"]


class ReturnRequest(BaseModel):
    as_of: date
    item: ReturnItem


def principal(credentials: Annotated[HTTPAuthorizationCredentials, Depends(HTTPBearer())]):
    if credentials.credentials != "demo-alice":
        raise HTTPException(403, "UNKNOWN_PRINCIPAL")
    return "alice"


@app.post("/orders/{order_id}/returns", operation_id="preview_return")
def preview_return(order_id: str, request: ReturnRequest, user: Annotated[str, Depends(principal)]):
    order = ORDERS.get(order_id)
    if order is None:
        raise HTTPException(404, "ORDER_NOT_FOUND")
    if order["owner"] != user:
        raise HTTPException(403, "ORDER_FORBIDDEN")
    if not 0 <= (request.as_of - order["delivered"]).days <= 30:
        raise HTTPException(409, "OUTSIDE_RETURN_WINDOW")
    if request.item.units > order["units"]:
        raise HTTPException(409, "TOO_MANY_UNITS")
    gross = order["paid"] * request.item.units / order["units"]
    rate = Decimal("0.85") if request.item.condition == "opened" else Decimal("1")
    refund = (gross * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return {"order": order_id, "currency": "USD", "refund": str(refund), "units": request.item.units}


# The MCP projection calls the ASGI application, including its authorization dependency.
api_client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://returns.local", headers=DEMO_HEADER)
mcp = FastApiMCP(app, http_client=api_client, include_operations=["preview_return"])
mcp.mount_http()
