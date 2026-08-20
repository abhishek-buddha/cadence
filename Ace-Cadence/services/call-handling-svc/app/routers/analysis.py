"""Post-call transcript analysis.

Port of Render's `callActions.analyzeTranscript`: one OpenAI extraction over the
call transcript, written into `call_results`, then outcome classification onto
the call and a claim-status advance. Nothing on AWS populated `call_results` or
`calls.outcome` automatically before this, which is why the outcome-based report
tabs were empty.

Two deliberate deviations from Render, both forced by AWS differences:

1. Claim status. AWS enforces a transition graph (`constants.py`) that Render did
   not have, so a blind `pending -> paid` write is rejected. We advance through
   the legal path and skip (with a logged reason) when the target is unreachable,
   rather than throwing away the whole analysis.

2. Handoff calls. Under AWS's Mode A handoff the AI deliberately stays silent
   once a human answers and collects no fields at all, so field-based
   classification would mark every *successful* handoff as "failed". Those calls
   are classified `transferred_to_human` instead — which is what the reports in
   reports-dashboards-svc already look for.

Render also placed an automatic follow-up call to the payer's human-agent number
at the end of this action. That is NOT ported: on Mode A a human operator is
already being connected, so it would double-dial the payer.
"""

import json
import logging
import urllib.error
import urllib.request
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.audit import write_audit_event
from common.db import get_db
from common.serialize import row_to_dict, to_json

from ..config import settings
from ..constants import validate_status_transition
from ..invalidate import publish_invalidation
from ..outcome_classifier import classify_medical_call_outcome

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analysis"])

# Extraction key -> call_results column. Mirrors Render's callResults.create args.
_RESULT_COLUMNS = {
    "claimStatus": "claim_status",
    "paidAmount": "paid_amount",
    "paidDate": "paid_date",
    "checkOrEftNumber": "check_or_eft_number",
    "denialCode": "denial_code",
    "remarkCode": "remark_code",
    "denialReason": "denial_reason",
    "appealDeadline": "appeal_deadline",
    "missingDocuments": "missing_documents",
    "expectedDecisionDate": "expected_decision_date",
    "referenceNumber": "reference_number",
    "repName": "rep_name",
    "nextSteps": "next_steps",
    "confidence": "confidence",
}

_HANDOFF_STATES_WITH_HUMAN = ("awaiting_human", "accepting", "connected", "handoff_ended")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _system_prompt(claim_context: str, today: str) -> str:
    """Kept byte-for-byte equivalent to Render's prompt — the extraction schema
    and the rules are what the classifier's required-field lists assume."""
    return f"""You are a medical billing data extraction specialist. You analyze phone call transcripts between healthcare billing agents and insurance company representatives to extract structured claim status data.

Today's date is {today}.
Claim context: {claim_context}

IMPORTANT RULES:
- Only extract information that was EXPLICITLY stated in the transcript. Never guess or infer.
- For relative dates like "tomorrow", "next week", "in 3 days", calculate the actual date based on today ({today}).
- If the insurance rep gave a clear status (paid, denied, pending, processing), use it. If they were vague or non-committal, use "pending_review".
- If the rep said something like "it will be ready by [date/time]" without giving a definitive status, that means the claim is still being processed — use "processing" and set expectedDecisionDate.
- For paidAmount, convert dollar amounts to cents (e.g., $500.00 = 50000). Only set this if a specific payment amount was confirmed.
- For denial codes, only use official CARC codes (e.g., CO-45, PR-96). Don't invent codes.
- referenceNumber should be a call reference number given by the rep, NOT the claim number itself.
- repName should be the name or ID of the insurance representative who handled the call.
- nextSteps should be a concise, actionable recommendation based on what was discussed.

Return a JSON object with ONLY these fields:
{{
  "claimStatus": "processing|paid|denied|pending_review|no_record|voicemail|ivr_only|no_answer|unknown",
  "paidAmount": null,
  "paidDate": null,
  "checkOrEftNumber": null,
  "denialCode": null,
  "remarkCode": null,
  "denialReason": null,
  "appealDeadline": null,
  "missingDocuments": null,
  "expectedDecisionDate": null,
  "referenceNumber": null,
  "repName": null,
  "nextSteps": "string"
}}

Use null for any field where the information was NOT explicitly provided in the call.

SPECIAL STATUSES:
- Use "voicemail" if the call went to voicemail or an answering machine
- Use "ivr_only" if the agent only reached an automated IVR system and never spoke to a human
- Use "no_answer" if the call rang but nobody answered
- Use "unknown" ONLY as a last resort when none of the above apply"""


def _call_openai(system_prompt: str, transcript: str) -> dict:
    """Blocking OpenAI call — handed to a threadpool by the caller."""
    payload = {
        "model": settings.openai_model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Transcript:\n{transcript}"},
        ],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode(),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.openai_api_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.loads(response.read().decode())


def _parse_extraction(completion: dict) -> dict:
    """Never raise on a malformed model reply — Render falls back to an
    explicitly-unknown extraction so the call still gets a result row."""
    try:
        return json.loads(completion["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError, ValueError):
        logger.warning("could not parse OpenAI extraction; falling back to unknown")
        return {
            "claimStatus": "unknown",
            "nextSteps": "Manual review required - could not parse transcript",
            "confidence": 0,
        }


async def _advance_claim_status(
    db: AsyncSession, claim_id: int, use_case: str, current: str, target: str
) -> str | None:
    """Move a claim toward `target` along legal transitions only.

    Render wrote the status directly; AWS validates transitions, so `pending ->
    paid` has to go via `in_progress`. Returns the status actually applied, or
    None when the target is unreachable (e.g. the claim is already terminal).
    """
    if current == target:
        return None
    path: list[str] = []
    try:
        validate_status_transition(use_case, current, target)
        path = [target]
    except ValueError:
        # Try the one legal intermediate hop Render implicitly relied on.
        try:
            validate_status_transition(use_case, current, "in_progress")
            validate_status_transition(use_case, "in_progress", target)
            path = ["in_progress", target]
        except ValueError:
            logger.info(
                "claim %s: cannot move %s -> %s (use_case=%s); leaving status unchanged",
                claim_id, current, target, use_case,
            )
            return None
    for step in path:
        await db.execute(
            text("UPDATE claims SET status = :status WHERE id = :id"),
            {"id": claim_id, "status": step},
        )
    return path[-1]


async def analyze_call(db: AsyncSession, call_id: int) -> dict:
    """Run extraction + classification for one call. Commits on success."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI not configured")

    result = await db.execute(
        text(
            "SELECT c.id, c.claim_id, c.transcript, c.status, c.handoff_state, c.human_transcript, "
            "c.use_case, cl.use_case AS claim_use_case, cl.status AS claim_status, "
            "cl.claim_number, cl.amount, cl.date_of_service, "
            "p.first_name, p.last_name, ic.name AS insurance_name "
            "FROM calls c "
            "LEFT JOIN claims cl ON cl.id = c.claim_id "
            "LEFT JOIN patients p ON p.id = cl.patient_id "
            "LEFT JOIN insurance_contacts ic ON ic.id = c.insurance_contact_id "
            "WHERE c.id = :id"
        ),
        {"id": call_id},
    )
    call = row_to_dict(result.first())
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    if not call.get("claim_id"):
        raise HTTPException(status_code=422, detail="Call is not linked to a claim")

    transcript = (call.get("transcript") or call.get("human_transcript") or "").strip()
    if not transcript:
        raise HTTPException(status_code=422, detail="Call has no transcript to analyze")

    amount = call.get("amount") or 0
    try:
        amount_text = f"{float(amount) / 100:.2f}"
    except (TypeError, ValueError):
        amount_text = str(amount)
    patient = f"{call.get('first_name') or ''} {call.get('last_name') or ''}".strip()
    claim_context = (
        f"Claim Number: {call.get('claim_number')}, Patient: {patient}, "
        f"Insurance: {call.get('insurance_name')}, Billed Amount: ${amount_text}, "
        f"Date of Service: {call.get('date_of_service')}"
    )
    today = _now().date().isoformat()

    try:
        completion = await run_in_threadpool(
            _call_openai, _system_prompt(claim_context, today), transcript
        )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:500]
        logger.error("OpenAI error %s: %s", exc.code, detail)
        raise HTTPException(status_code=502, detail=f"OpenAI error {exc.code}") from exc
    except Exception as exc:
        logger.exception("OpenAI request failed")
        raise HTTPException(status_code=502, detail="OpenAI request failed") from exc

    extraction = _parse_extraction(completion)
    now = _now()
    auto_ref = f"REF-{now.strftime('%Y%m%d-%H%M%S')}"
    reference_number = extraction.get("referenceNumber") or auto_ref
    extraction["referenceNumber"] = reference_number

    use_case = call.get("use_case") or call.get("claim_use_case") or "medical_claim"
    columns = ["call_id", "claim_id", "use_case", "raw_extraction"]
    params: dict = {
        "call_id": call_id,
        "claim_id": call["claim_id"],
        "use_case": use_case,
        "raw_extraction": to_json(extraction),
    }
    for key, column in _RESULT_COLUMNS.items():
        columns.append(column)
        params[column] = extraction.get(key)
    await db.execute(
        text(
            f"INSERT INTO call_results ({', '.join(columns)}) "
            f"VALUES ({', '.join(':' + c for c in columns)})"
        ),
        params,
    )

    # Classify. A call that reached a human operator is 'transferred_to_human' —
    # the AI was never meant to collect fields on it (see module docstring).
    if call.get("handoff_state") in _HANDOFF_STATES_WITH_HUMAN:
        classification = {
            "outcome": "transferred_to_human",
            "requiredFieldsRetrieved": [],
            "missingFields": [],
            "reason": f"Call handed off to a Cadence operator (handoff_state={call['handoff_state']})",
        }
    else:
        classification = classify_medical_call_outcome(extraction, extraction.get("claimStatus"))

    await db.execute(
        text(
            "UPDATE calls SET outcome = :outcome, outcome_reason = :reason, "
            "required_fields_retrieved = :retrieved, missing_fields = :missing WHERE id = :id"
        ),
        {
            "id": call_id,
            "outcome": classification["outcome"],
            "reason": classification["reason"],
            "retrieved": to_json(classification["requiredFieldsRetrieved"]),
            "missing": to_json(classification["missingFields"]),
        },
    )

    # Claim status + denial detail, along legal transitions only.
    # NB: `extracted_status` is what the model read off the call; the claim's own
    # current status is call["claim_status"] (aliased from cl.status in the SELECT).
    extracted_status = extraction.get("claimStatus")
    target = {"paid": "paid", "denied": "denied"}.get(extracted_status, "in_progress")
    applied = await _advance_claim_status(
        db, call["claim_id"], call.get("claim_use_case") or "medical_claim",
        call.get("claim_status") or "pending", target,
    )
    claim_updates = {"reference_number": reference_number}
    if extracted_status == "denied":
        for key, column in (
            ("denialCode", "denial_code"),
            ("denialReason", "denial_reason"),
            ("remarkCode", "remark_code"),
            ("appealDeadline", "appeal_deadline"),
        ):
            if extraction.get(key):
                claim_updates[column] = extraction[key]
    assignments = ", ".join(f"{c} = :{c}" for c in claim_updates)
    await db.execute(
        text(f"UPDATE claims SET {assignments} WHERE id = :id"),
        {**claim_updates, "id": call["claim_id"]},
    )

    # Render set claims.nextFollowUpDate; on AWS that lives in claim_followups.
    if extraction.get("expectedDecisionDate"):
        await db.execute(
            text(
                "INSERT INTO claim_followups (claim_id, next_follow_up_date) VALUES (:id, :d) "
                "ON DUPLICATE KEY UPDATE next_follow_up_date = VALUES(next_follow_up_date)"
            ),
            {"id": call["claim_id"], "d": extraction["expectedDecisionDate"]},
        )

    await db.execute(
        text(
            "INSERT INTO call_events (call_id, type, message, timestamp) "
            "VALUES (:id, 'outcome_classified', :message, :now)"
        ),
        {"id": call_id, "message": classification["outcome"], "now": now},
    )
    # 'classify_outcome' isn't in common.audit's allowed action list, so this is
    # an 'update' with the outcome in the summary.
    await write_audit_event(
        db,
        action="update",
        resource_type="call",
        resource_id=str(call_id),
        payload_summary=f"outcome={classification['outcome']}",
    )
    await db.commit()
    # Outcome + claim status both moved: refresh call and claim views.
    await publish_invalidation("call", call_id)
    await publish_invalidation("claim", call["claim_id"])

    return {
        "callId": call_id,
        "extraction": extraction,
        "outcome": classification["outcome"],
        "claimStatusApplied": applied,
    }


@router.post("/calls/{call_id}/analyze")
async def analyze_call_endpoint(call_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    """Manual/backfill trigger. The automatic path is the ElevenLabs post-call
    webhook; this exists to re-run analysis on an existing transcript."""
    return await analyze_call(db, call_id)
