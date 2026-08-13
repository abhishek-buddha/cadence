import urllib.parse
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.db import get_db
from common.serialize import row_to_dict

from .calls import _claim_context, _dynamic_vars

router = APIRouter(tags=["twilio-compat"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _form(request: Request) -> dict[str, str]:
    raw = (await request.body()).decode(errors="ignore")
    parsed = urllib.parse.parse_qs(raw)
    return {k: v[-1] for k, v in parsed.items() if v}


@router.get("/call-metadata")
async def call_metadata(callId: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(text("SELECT claim_id, handoff_token FROM calls WHERE id = :id"), {"id": callId})
    call = row_to_dict(result.first())
    if not call:
        return {"error": "Call not found"}
    row = await _claim_context(db, call["claim_id"])
    return {
        "callId": callId,
        "claimId": call["claim_id"],
        "dynamic_variables": _dynamic_vars(row, callId, call.get("handoff_token") or ""),
        "conversation_config_override": {"turn": {"silence_end_call_timeout": -1}},
    }


@router.post("/twilio-request-handoff")
@router.get("/twilio-request-handoff")
async def request_handoff(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    params = request.query_params
    call_id = params.get("callId") or params.get("call_id")
    reason = params.get("reason") or "ivr_human_handoff_detected"
    if not call_id:
        return {"ok": False, "error": "could_not_correlate_call"}
    existing = await db.execute(text("SELECT id FROM calls WHERE id = :id"), {"id": int(call_id)})
    if row_to_dict(existing.first()) is None:
        return {"ok": False, "error": "call_not_found", "callId": call_id}
    await db.execute(
        text("""
        UPDATE calls
        SET handoff_state = 'awaiting_human', handoff_requested_at = :now,
            human_detected_at = COALESCE(human_detected_at, :now), handoff_reason = :reason,
            conference_name = COALESCE(conference_name, :conference)
        WHERE id = :id AND (handoff_state IS NULL OR handoff_state NOT IN ('awaiting_human', 'accepting', 'connected', 'handoff_ended'))
        """),
        {"id": int(call_id), "now": _now(), "reason": reason, "conference": f"cadence-{call_id}"},
    )
    await db.execute(
        text("INSERT INTO call_events (call_id, type, message, timestamp) VALUES (:id, 'handoff_requested', :reason, :now)"),
        {"id": int(call_id), "reason": reason, "now": _now()},
    )
    await db.commit()
    return {"ok": True, "callId": call_id}


@router.post("/call-ended")
@router.get("/call-ended")
async def call_ended(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    call_id = request.query_params.get("callId") or request.query_params.get("call_id")
    if not call_id:
        return {"success": False, "error": "Missing callId"}
    if request.query_params.get("handoff") == "1":
        return {"success": True, "handoff": True}
    await db.execute(
        text("UPDATE calls SET status = 'completed', completed_at = COALESCE(completed_at, :now) WHERE id = :id AND completed_at IS NULL"),
        {"id": int(call_id), "now": _now()},
    )
    await db.commit()
    return {"success": True}


@router.post("/twilio-status")
async def twilio_status(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    data = await _form(request)
    sid = data.get("CallSid")
    status = data.get("CallStatus")
    if sid and status in {"completed", "failed", "busy", "no-answer", "canceled"}:
        final = "completed" if status == "completed" else "failed"
        await db.execute(
            text("UPDATE calls SET status = :final, completed_at = COALESCE(completed_at, :now), duration = COALESCE(duration, :duration) WHERE twilio_call_sid = :sid"),
            {"sid": sid, "final": final, "now": _now(), "duration": data.get("CallDuration")},
        )
        await db.commit()
    return {"success": True}