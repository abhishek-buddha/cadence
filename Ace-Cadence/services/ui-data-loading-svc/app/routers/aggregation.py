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


def _merge_claim(claim: dict, followup: dict | None, patients: dict, providers: dict, payer_name: str | None) -> dict:
    patient = patients.get(claim.get("patient_id")) or {}
    provider = providers.get(claim.get("provider_id")) or {}
    name = f"{patient.get('first_name') or ''} {patient.get('last_name') or ''}".strip()
    return {
        **claim,
        "patient_name": name or None,
        "patient_dob": patient.get("date_of_birth"),
        "member_id": patient.get("member_id"),
        "provider_name": provider.get("practice_name"),
        "insurance_company": payer_name,
        "last_called_at": (followup or {}).get("last_called_at"),
        "next_follow_up_date": (followup or {}).get("next_follow_up_date"),
        "follow_up_disposition": (followup or {}).get("follow_up_disposition"),
        "follow_up_comment": (followup or {}).get("follow_up_comment"),
    }


# A disposition of complete/denied means the operator has finished with that
# claim, so it drops out of the "still to process" list.
_PROCESSED_DISPOSITIONS = {"complete", "denied"}


@router.get("/related-for-call/{call_id}")
async def get_related_claims_for_call(call_id: int) -> dict:
    """Everything the operator's post-call workspace needs: the handed-off claim
    plus the other still-open claims for the SAME payer, so one call can clear
    several claims.

    Feeds `api.claimFollowups.listRelatedForCall`, which the UI called but which
    had no backend at all — `api.claimFollowups` was undefined, so the operator
    queue crashed with "Cannot read properties of undefined" the moment a
    handoff was accepted.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        call_resp = await client.get(f"{settings.call_handling_svc_url}/calls/{call_id}")
        if call_resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Call not found")
        call_resp.raise_for_status()
        call = call_resp.json()

        claim_id = call.get("claim_id")
        payer_id = call.get("insurance_contact_id")
        if not claim_id:
            # Not a claim-based call (dental/generic) — nothing to group.
            return {"current_claim": None, "related_claims": [], "payer_name": None, "processed_count": 0}

        current_resp = await client.get(f"{settings.call_handling_svc_url}/claims/{claim_id}")
        if current_resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Claim not found")
        current_resp.raise_for_status()
        current = current_resp.json()
        payer_id = payer_id or current.get("insurance_contact_id")

        # Lists are fetched whole and indexed rather than per-claim: this dataset
        # is small (tens of rows) and it keeps the fan-out at a fixed 3 requests
        # instead of 2 per claim.
        siblings_resp, payer, patients_resp, providers_resp = await asyncio.gather(
            client.get(f"{settings.call_handling_svc_url}/claims", params={"insurance_contact_id": payer_id}),
            _get_optional(client, f"{settings.master_data_svc_url}/insurance-contacts/{payer_id}"),
            client.get(f"{settings.master_data_svc_url}/patients"),
            client.get(f"{settings.master_data_svc_url}/providers"),
        )
        for resp in (siblings_resp, patients_resp, providers_resp):
            resp.raise_for_status()

        patients = {p["id"]: p for p in patients_resp.json()}
        providers = {p["id"]: p for p in providers_resp.json()}
        payer_name = (payer or {}).get("name")

        siblings = [c for c in siblings_resp.json() if c["id"] != claim_id]
        followups = await asyncio.gather(*[
            _get_optional(client, f"{settings.call_handling_svc_url}/claims/{c['id']}/followup")
            for c in [current, *siblings]
        ])

    current_followup, sibling_followups = followups[0], followups[1:]
    merged = [
        _merge_claim(claim, followup, patients, providers, payer_name)
        for claim, followup in zip(siblings, sibling_followups)
    ]
    open_claims = [c for c in merged if c["follow_up_disposition"] not in _PROCESSED_DISPOSITIONS]

    return {
        "current_claim": _merge_claim(current, current_followup, patients, providers, payer_name),
        "related_claims": open_claims,
        "payer_name": payer_name,
        "processed_count": len(merged) - len(open_claims),
    }
