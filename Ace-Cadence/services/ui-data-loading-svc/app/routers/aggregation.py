import asyncio

import httpx
from fastapi import APIRouter, HTTPException

from ..config import settings

router = APIRouter(tags=["aggregation"])


async def _get_optional(client: httpx.AsyncClient, url: str) -> dict | None:
    response = await client.get(url)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


@router.get("/claims/{claim_id}/full")
async def get_claim_full_detail(claim_id: int) -> dict:
    """Joins claim + follow-up + calls (call-handling-svc) with patient +
    payer + provider (master-data-svc) into one response — replaces four
    separate frontend round-trips (see architecture plan §2,
    ui-data-loading-svc)."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        claim_resp = await client.get(f"{settings.call_handling_svc_url}/claims/{claim_id}")
        if claim_resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Claim not found")
        claim_resp.raise_for_status()
        claim = claim_resp.json()

        followup, calls_resp, patient, insurance_contact, provider = await asyncio.gather(
            _get_optional(client, f"{settings.call_handling_svc_url}/claims/{claim_id}/followup"),
            client.get(f"{settings.call_handling_svc_url}/calls", params={"claim_id": claim_id}),
            _get_optional(client, f"{settings.master_data_svc_url}/patients/{claim['patient_id']}"),
            _get_optional(
                client, f"{settings.master_data_svc_url}/insurance-contacts/{claim['insurance_contact_id']}"
            ),
            _get_optional(client, f"{settings.master_data_svc_url}/providers/{claim['provider_id']}"),
        )
        calls_resp.raise_for_status()

    return {
        "claim": claim,
        "followup": followup,
        "patient": patient,
        "insurance_contact": insurance_contact,
        "provider": provider,
        "calls": calls_resp.json(),
    }
