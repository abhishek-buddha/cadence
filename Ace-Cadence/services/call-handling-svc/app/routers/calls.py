from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.audit import write_audit_event
from common.db import get_db
from common.serialize import from_json, row_to_dict, rows_to_dicts, to_json

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
    ElevenLabs — telephony-bridge-svc / this service's own call-placement
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
