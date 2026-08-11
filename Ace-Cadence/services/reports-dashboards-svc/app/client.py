import httpx

from .config import settings


async def fetch_calls(use_case: str | None = None) -> list[dict]:
    """Read-only cross-service fetch (architecture plan's deliberate
    exception for reports-dashboards-svc — see §2 'Read-only cross-service
    exception'). Pulls the full calls list and filters/aggregates in
    memory; fine at this app's call volume."""
    params = {}
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f"{settings.call_handling_svc_url}/calls", params=params)
        response.raise_for_status()
        calls = response.json()
    if use_case is not None:
        calls = [c for c in calls if c.get("use_case") == use_case]
    return calls


async def fetch_call_results() -> list[dict]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f"{settings.call_handling_svc_url}/call-results")
        response.raise_for_status()
        return response.json()


async def fetch_claims(use_case: str | None = None) -> list[dict]:
    params = {}
    if use_case is not None:
        params["use_case"] = use_case
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f"{settings.call_handling_svc_url}/claims", params=params)
        response.raise_for_status()
        return response.json()


async def fetch_insurance_contacts() -> list[dict]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f"{settings.master_data_svc_url}/insurance-contacts")
        response.raise_for_status()
        return response.json()
