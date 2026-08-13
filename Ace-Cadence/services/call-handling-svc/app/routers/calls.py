import base64
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.audit import write_audit_event
from common.db import get_db
from common.serialize import from_json, row_to_dict, rows_to_dicts, to_json

from ..config import settings

router = APIRouter(prefix="/calls", tags=["calls"])

_JSON_FIELDS = {"required_fields_retrieved", "missing_fields", "linked_claim_ids"}

_CREATE_FIELDS = {
    "claim_id", "insurance_contact_id", "session_id", "use_case", "status",
    "parent_call_id", "attempt_number", "started_at",
}

_UPDATABLE_FIELDS = {
    "status", "eleven_labs_conversation_id", "twilio_call_sid", "duration", "transcript",
    "recording_path", "error_message", "call_phase", "hold_started_at", "hold_duration",
    "human_detected_at", "ivr_sequence_used", "outcome", "outcome_reason",
    "required_fields_retrieved", "missing_fields", "transferred_at", "transfer_type",
    "transfer_destination", "handoff_follow_up_at", "handoff_state", "handoff_requested_at",
    "handoff_reason", "handoff_accepted_by_user_id", "handoff_accepted_by_email",
    "handoff_accepted_at", "assigned_agent_user_id", "assigned_agent_email",
    "assigned_agent_name", "conference_name", "ai_participant_call_sid",
    "human_participant_call_sid", "handoff_token", "human_transcript", "ai_recording_path",
    "human_recording_path", "wrap_up_completed_at", "linked_claim_ids", "completed_at",
}


def _decode(call: dict) -> dict:
    for field in _JSON_FIELDS:
        call[field] = from_json(call[field])
    return call


@router.get("")
async def list_calls(
    claim_id: int | None = None,
    status: str | None = None,
    handoff_state: str | None = None,
    assigned_agent_user_id: int | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    clauses, params = [], {}
    for field, value in (
        ("claim_id", claim_id), ("status", status), ("handoff_state", handoff_state),
        ("assigned_agent_user_id", assigned_agent_user_id),
    ):
        if value is not None:
            clauses.append(f"{field} = :{field}")
            params[field] = value
    query = "SELECT * FROM calls"
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY started_at DESC"
    result = await db.execute(text(query), params)
    return [_decode(r) for r in rows_to_dicts(result)]


@router.get("/{call_id}")
async def get_call(call_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(text("SELECT * FROM calls WHERE id = :id"), {"id": call_id})
    call = row_to_dict(result.first())
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    return _decode(call)


@router.post("", status_code=201)
async def create_call(body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    """Creates the `calls` row for a call already placed via Twilio/
    ElevenLabs - telephony-bridge-svc / this service's own call-placement
    logic is responsible for actually dialing; this endpoint just records
    the resulting call. (Real dialing logic lands in a later pass.)"""
    for field in ("insurance_contact_id", "started_at"):
        if field not in body:
            raise HTTPException(status_code=422, detail=f"Missing field: {field}")

    columns = sorted(_CREATE_FIELDS)
    params = {f: body.get(f) for f in columns}
    params["status"] = params.get("status") or "initiating"
    result = await db.execute(
        text(f"INSERT INTO calls ({', '.join(columns)}) VALUES ({', '.join(':' + c for c in columns)})"),
        params,
    )
    await write_audit_event(db, action="create", resource_type="call", resource_id=str(result.lastrowid))
    await db.commit()
    return await get_call(result.lastrowid, db)



_CALL_CONTEXT_SQL = """
SELECT
  c.id AS claim_id, c.claim_number, c.insurance_contact_id, c.provider_id, c.patient_id,
  c.date_of_service, c.amount, c.cpt_codes, c.diagnosis_codes, c.status AS claim_status, c.use_case,
  p.first_name, p.last_name, p.date_of_birth, p.member_id, p.group_number,
  ic.name AS insurance_name, ic.phone AS insurance_phone, ic.call_connection_type,
  ic.ivr_instructions, ic.ivr_steps, ic.voice_ivr_enabled, ic.voice_ivr_phrases, ic.human_agent_number,
  pr.practice_name, pr.npi, pr.tax_id, pr.phone AS provider_phone
FROM claims c
JOIN patients p ON p.id = c.patient_id
JOIN insurance_contacts ic ON ic.id = c.insurance_contact_id
JOIN providers pr ON pr.id = c.provider_id
WHERE c.id = :claim_id
"""


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _json_list(value):
    return from_json(value) or []


def _auth_header(user: str, password: str) -> str:
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


def _public_url(path: str) -> str:
    return f"{settings.public_base_url.rstrip('/')}{path}"


def _post_form(url: str, data: dict, auth: str | None = None) -> dict:
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if auth:
        headers["Authorization"] = auth
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode() or "{}")


def _post_json(url: str, payload: dict, api_key: str) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "xi-api-key": api_key},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode() or "{}")


def _dynamic_vars(row: dict, call_id: int, handoff_token: str = "", direct: bool = False, bridge: bool = True) -> dict[str, str]:
    cpt_codes = _json_list(row.get("cpt_codes"))
    amount = row.get("amount") or 0
    try:
        amount_text = f"{float(amount) / 100:.2f}"
    except (TypeError, ValueError):
        amount_text = str(amount)
    ivr_instructions = "You are already through to a live representative directly - there is no IVR to navigate on this call. Proceed straight to the conversation arc." if direct else (row.get("ivr_instructions") or "N/A")
    return {
        "practice_name": row.get("practice_name") or "",
        "npi": row.get("npi") or "",
        "tax_id": row.get("tax_id") or "",
        "callback_number": row.get("provider_phone") or "",
        "patient_name": f"{row.get('first_name') or ''} {row.get('last_name') or ''}".strip(),
        "patient_dob": row.get("date_of_birth") or "",
        "member_id": row.get("member_id") or "",
        "group_number": row.get("group_number") or "N/A",
        "claim_number": row.get("claim_number") or "",
        "date_of_service": row.get("date_of_service") or "",
        "amount": amount_text,
        "cpt_codes": ", ".join(cpt_codes) if cpt_codes else "N/A",
        "internal_call_id": str(call_id),
        "internal_claim_id": str(row.get("claim_id")),
        "insurance_name": row.get("insurance_name") or "",
        "insurance_phone": row.get("insurance_phone") or "",
        "ivr_instructions": ivr_instructions,
        "voice_ivr_phrases": json.dumps(_json_list(row.get("voice_ivr_phrases")) if row.get("voice_ivr_enabled") else []),
        "human_agent_number": "N/A" if direct else (row.get("human_agent_number") or "N/A"),
        "bridge_number": settings.twilio_phone_number if bridge else "",
        "handoff_token": handoff_token,
    }


async def _claim_context(db: AsyncSession, claim_id: int) -> dict:
    result = await db.execute(text(_CALL_CONTEXT_SQL), {"claim_id": claim_id})
    row = row_to_dict(result.first())
    if row is None:
        raise HTTPException(status_code=404, detail="Claim not found")
    return row


async def _create_call(db: AsyncSession, row: dict, parent_call_id: int | None = None) -> int:
    result = await db.execute(
        text("""
        INSERT INTO calls (claim_id, insurance_contact_id, use_case, status, parent_call_id, started_at)
        VALUES (:claim_id, :insurance_contact_id, :use_case, 'initiating', :parent_call_id, :started_at)
        """),
        {
            "claim_id": row["claim_id"],
            "insurance_contact_id": row["insurance_contact_id"],
            "use_case": row.get("use_case") or "medical_claim",
            "parent_call_id": parent_call_id,
            "started_at": _now(),
        },
    )
    call_id = result.lastrowid
    await write_audit_event(db, action="create", resource_type="call", resource_id=str(call_id))
    return call_id


async def _mark_started(db: AsyncSession, call_id: int, sid: str | None, conversation_id: str | None = None) -> None:
    await db.execute(
        text("""
        UPDATE calls
        SET status = 'in_progress', twilio_call_sid = :sid, eleven_labs_conversation_id = :conversation_id
        WHERE id = :id
        """),
        {"id": call_id, "sid": sid, "conversation_id": conversation_id},
    )


async def _mark_failed(db: AsyncSession, call_id: int, message: str) -> None:
    await db.execute(text("UPDATE calls SET status = 'failed', error_message = :message WHERE id = :id"), {"id": call_id, "message": message})


@router.post("/initiate")
async def initiate_call(body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    claim_id = int(body.get("claim_id") or body.get("claimId") or 0)
    if not claim_id:
        raise HTTPException(status_code=422, detail="Missing field: claim_id")
    row = await _claim_context(db, claim_id)
    mode = row.get("call_connection_type") or "ivr_human_handoff"
    call_id = await _create_call(db, row)
    handoff_token = str(int(time.time() * 1000))[-8:]
    await db.execute(
        text("UPDATE calls SET handoff_token = :token, conference_name = :conference WHERE id = :id"),
        {"id": call_id, "token": handoff_token, "conference": f"cadence-{call_id}"},
    )

    try:
        if mode == "ivr_human_handoff":
            if not (settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_phone_number):
                raise RuntimeError("Twilio not configured")
            auth = _auth_header(settings.twilio_account_sid, settings.twilio_auth_token)
            twilio = _post_form(
                f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Calls.json",
                {
                    "To": row["insurance_phone"],
                    "From": settings.twilio_phone_number,
                    "Url": _public_url(f"/twiml-call-start?callId={call_id}&claimId={claim_id}"),
                    "StatusCallback": _public_url("/twilio-status"),
                    "StatusCallbackEvent": "initiated ringing answered completed",
                    "Timeout": "60",
                },
                auth,
            )
            await _mark_started(db, call_id, twilio.get("sid"))
        else:
            if not (settings.elevenlabs_api_key and settings.elevenlabs_agent_id and settings.elevenlabs_agent_phone_number_id):
                raise RuntimeError("ElevenLabs not configured")
            direct = mode == "direct_to_agent"
            to_number = row.get("human_agent_number") if direct else row.get("insurance_phone")
            if not to_number:
                raise RuntimeError("No human agent number configured" if direct else "No payer phone configured")
            eleven = _post_json(
                "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
                {
                    "agent_id": settings.elevenlabs_agent_id,
                    "agent_phone_number_id": settings.elevenlabs_agent_phone_number_id,
                    "to_number": to_number,
                    "conversation_initiation_client_data": {"dynamic_variables": _dynamic_vars(row, call_id, handoff_token, direct=direct, bridge=False)},
                },
                settings.elevenlabs_api_key,
            )
            await _mark_started(db, call_id, eleven.get("call_sid") or eleven.get("callSid"), eleven.get("conversation_id") or eleven.get("conversationId"))

        if row.get("claim_status") == "pending":
            await db.execute(text("UPDATE claims SET status = 'in_progress' WHERE id = :id"), {"id": claim_id})
        await db.execute(text("UPDATE claim_followups SET last_called_at = :now WHERE claim_id = :id"), {"id": claim_id, "now": _now()})
        await db.commit()
        return {"success": True, "callId": call_id, "mode": mode}
    except Exception as exc:
        await _mark_failed(db, call_id, str(exc))
        await db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

@router.patch("/{call_id}")
async def update_call(call_id: int, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM calls WHERE id = :id"), {"id": call_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="Call not found")

    updates = {k: v for k, v in body.items() if k in _UPDATABLE_FIELDS}
    if not updates:
        return await get_call(call_id, db)

    set_clause = ", ".join(f"{field} = :{field}" for field in updates)
    params = {k: (to_json(v) if k in _JSON_FIELDS else v) for k, v in updates.items()}
    params["id"] = call_id
    await db.execute(text(f"UPDATE calls SET {set_clause} WHERE id = :id"), params)
    await write_audit_event(db, action="update", resource_type="call", resource_id=str(call_id))
    await db.commit()
    return await get_call(call_id, db)
