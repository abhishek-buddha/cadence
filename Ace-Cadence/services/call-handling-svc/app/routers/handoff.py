import base64
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from html import escape

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.db import get_db
from common.serialize import from_json, row_to_dict, rows_to_dicts

router = APIRouter(prefix="/handoff", tags=["handoff"])

_LIVE_HANDOFF = {"awaiting_human", "accepting", "connected"}
_WRAP_UP_HANDOFF = {"handoff_ended", "handoff_failed"}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _decode(row: dict | None) -> dict | None:
    if row is None:
        return None
    for field in ("required_fields_retrieved", "missing_fields", "linked_claim_ids", "cpt_codes", "diagnosis_codes"):
        if field in row:
            row[field] = from_json(row[field])
    return row


def _is_active_call(call: dict) -> bool:
    state = call.get("handoff_state")
    if state in _LIVE_HANDOFF:
        return not call.get("completed_at")
    if state in _WRAP_UP_HANDOFF and not call.get("wrap_up_completed_at"):
        return True
    if call.get("status") not in {"initiating", "in_progress"} or call.get("completed_at"):
        return False
    started_at = call.get("started_at")
    if isinstance(started_at, str):
        started_at = datetime.fromisoformat(started_at.replace("Z", "+00:00")).replace(tzinfo=None)
    return bool(started_at and started_at >= _now() - timedelta(hours=6))


async def _log_event(db: AsyncSession, call_id: int, event_type: str, message: str | None = None) -> None:
    await db.execute(
        text("INSERT INTO call_events (call_id, type, message, timestamp) VALUES (:call_id, :type, :message, :timestamp)"),
        {"call_id": call_id, "type": event_type, "message": message, "timestamp": _now()},
    )


_CALL_SELECT = """
SELECT
  c.*,
  ic.name AS insurance_company,
  ic.human_agent_number AS human_agent_number,
  cl.claim_number AS claim_number,
  cl.amount AS claim_amount,
  cl.date_of_service AS claim_date_of_service,
  cl.cpt_codes AS cpt_codes,
  cl.diagnosis_codes AS diagnosis_codes,
  cl.status AS claim_status,
  cl.priority AS claim_priority,
  p.first_name AS patient_first_name,
  p.last_name AS patient_last_name,
  p.date_of_birth AS patient_dob,
  p.member_id AS member_id,
  pr.practice_name AS provider_name,
  pr.npi AS provider_npi
FROM calls c
LEFT JOIN insurance_contacts ic ON ic.id = c.insurance_contact_id
LEFT JOIN claims cl ON cl.id = c.claim_id
LEFT JOIN patients p ON p.id = cl.patient_id
LEFT JOIN providers pr ON pr.id = cl.provider_id
"""


async def _get_call(db: AsyncSession, call_id: int) -> dict | None:
    result = await db.execute(text(_CALL_SELECT + " WHERE c.id = :id"), {"id": call_id})
    return _decode(row_to_dict(result.first()))


async def _list_calls(db: AsyncSession, where: str, params: dict | None = None, limit: int = 100) -> list[dict]:
    result = await db.execute(text(_CALL_SELECT + f" WHERE {where} ORDER BY c.started_at DESC LIMIT {limit}"), params or {})
    return [_decode(r) for r in rows_to_dicts(result)]


def _public_base_url(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}".rstrip("/")


def _twilio_post(account_sid: str, auth_token: str, path: str, body: dict[str, str]) -> dict:
    data = urllib.parse.urlencode(body).encode()
    req = urllib.request.Request(
        f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}{path}",
        data=data,
        method="POST",
        headers={
            "Authorization": "Basic " + base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode(),
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        raw = response.read().decode()
        return {"status": response.status, "body": raw}


@router.get("/awaiting")
async def list_awaiting_handoff(db: AsyncSession = Depends(get_db)) -> list[dict]:
    return await _list_calls(
        db,
        "c.handoff_state = 'awaiting_human' AND c.status NOT IN ('completed', 'failed')",
        limit=50,
    )


@router.get("/live")
async def list_live(db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = await _list_calls(
        db,
        """
        c.handoff_state IN ('awaiting_human', 'accepting', 'connected')
        OR (
          c.status IN ('initiating', 'in_progress')
          AND c.completed_at IS NULL
          AND c.started_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR)
        )
        """,
        limit=100,
    )
    return [row for row in rows if _is_active_call(row)]


@router.get("/routing/status")
async def get_my_routing_status(user_id: int, db: AsyncSession = Depends(get_db)) -> dict | None:
    user_result = await db.execute(text("SELECT * FROM users WHERE id = :id"), {"id": user_id})
    user = row_to_dict(user_result.first())
    if user is None:
        return None
    calls = await _list_calls(db, "c.assigned_agent_user_id = :user_id", {"user_id": user_id}, limit=25)
    active_call = next((call for call in calls if _is_active_call(call)), None)
    if active_call and active_call.get("handoff_state") == "awaiting_human":
        availability = "assigned"
    elif active_call and active_call.get("handoff_state") in _WRAP_UP_HANDOFF:
        availability = "wrap_up"
    elif active_call:
        availability = "in_call"
    else:
        availability = "available"
    return {"user": user, "availability": availability, "activeCall": active_call}


@router.get("/routing/agents")
async def list_routing_agents(db: AsyncSession = Depends(get_db)) -> list[dict]:
    users_result = await db.execute(text("SELECT * FROM users WHERE role = 'operator' AND status != 'disabled' ORDER BY name, email"))
    users = rows_to_dicts(users_result)
    rows = []
    for user in users:
        status = await get_my_routing_status(user["id"], db)
        rows.append({
            "user": user,
            "availability": status["availability"] if status else "unknown",
            "activeCall": status["activeCall"] if status else None,
        })
    return rows


@router.get("/{call_id}")
async def get_handoff(call_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    call = await _get_call(db, call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    events = await db.execute(
        text("SELECT * FROM call_events WHERE call_id = :call_id ORDER BY timestamp"),
        {"call_id": call_id},
    )
    return {"call": call, "events": rows_to_dicts(events)}


@router.post("/{call_id}/accept")
async def accept_handoff(call_id: int, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    agent_id = body.get("agent_user_id")
    agent = None
    if agent_id is not None:
        agent_result = await db.execute(text("SELECT * FROM users WHERE id = :id"), {"id": agent_id})
        agent = row_to_dict(agent_result.first())
    result = await db.execute(
        text(
            """
            UPDATE calls
            SET handoff_state = 'accepting',
                handoff_accepted_by_user_id = :agent_id,
                handoff_accepted_by_email = :email,
                handoff_accepted_at = :now,
                assigned_agent_user_id = COALESCE(assigned_agent_user_id, :agent_id),
                assigned_agent_email = COALESCE(assigned_agent_email, :email),
                assigned_agent_name = COALESCE(assigned_agent_name, :name),
                conference_name = COALESCE(conference_name, :conference_name)
            WHERE id = :call_id
              AND handoff_state = 'awaiting_human'
              AND (:agent_id IS NULL OR assigned_agent_user_id IS NULL OR assigned_agent_user_id = :agent_id)
            """
        ),
        {
            "call_id": call_id,
            "agent_id": agent_id,
            "email": agent.get("email") if agent else body.get("agent_email"),
            "name": agent.get("name") if agent else body.get("agent_name"),
            "conference_name": f"cadence-{call_id}",
            "now": _now(),
        },
    )
    if result.rowcount != 1:
        existing = await _get_call(db, call_id)
        if existing is None:
            return {"ok": False, "reason": "not_found"}
        return {"ok": False, "reason": "already_taken"}
    await _log_event(db, call_id, "handoff_accepted", agent.get("email") if agent else body.get("agent_email"))
    await db.commit()
    return {"ok": True, "conferenceName": f"cadence-{call_id}"}


@router.post("/{call_id}/decline")
async def decline_handoff(call_id: int, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    if await _get_call(db, call_id) is None:
        return {"ok": False, "reason": "not_found"}
    await _log_event(db, call_id, "handoff_declined", body.get("agent_email") or body.get("agent_name") or "operator")
    await db.commit()
    return {"ok": True}


@router.post("/{call_id}/connected")
async def mark_connected(call_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(
        text("UPDATE calls SET handoff_state = 'connected' WHERE id = :call_id AND handoff_state IN ('accepting', 'connected')"),
        {"call_id": call_id},
    )
    if result.rowcount != 1:
        return {"ok": False, "reason": "unexpected_state"}
    await _log_event(db, call_id, "handoff_connected", "browser softphone bridged")
    await db.commit()
    return {"ok": True}


@router.post("/{call_id}/ended")
async def end_handoff(call_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(
        text("UPDATE calls SET handoff_state = 'handoff_ended' WHERE id = :call_id"),
        {"call_id": call_id},
    )
    if result.rowcount != 1:
        return {"ok": False, "reason": "not_found"}
    await _log_event(db, call_id, "handoff_ended", "ended_by_operator")
    await db.commit()
    return {"ok": True}


@router.post("/{call_id}/complete-wrap-up")
async def complete_wrap_up(call_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(
        text("UPDATE calls SET wrap_up_completed_at = :now WHERE id = :call_id"),
        {"call_id": call_id, "now": _now()},
    )
    if result.rowcount != 1:
        return {"ok": False, "reason": "not_found"}
    await _log_event(db, call_id, "wrap_up_completed", "operator marked call complete")
    await db.commit()
    return {"ok": True}


@router.post("/{call_id}/payer-conference-twiml")
async def payer_conference_twiml(call_id: int, request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    call = await _get_call(db, call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    conference_name = call.get("conference_name") or f"cadence-{call_id}"
    # statusCallback is what makes a phone-side hangup visible immediately:
    # post-handoff the payer lives in this conference, so leave/end events here
    # are the end signal. Declared on the payer leg (first in, longest-lived) —
    # Twilio fires conference events once regardless of participant count.
    base = _public_base_url(request)
    status_callback = f"{base}/twilio-conference-status?callId={call_id}"
    # record-from-start captures the human<->human portion for QA/audit. Twilio
    # records the conference once no matter how many participants ask for it, so
    # it is declared here (payer leg) only. recordingStatusCallback fires once
    # when the file is ready — see routers/recordings.py.
    recording_callback = f"{base}/twilio-recording-status?callId={call_id}"
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference startConferenceOnEnter="true" endConferenceOnExit="false"
                waitUrl="{escape(base)}/twiml-conference-hold" beep="false"
                statusCallback="{escape(status_callback)}"
                statusCallbackEvent="start end join leave"
                statusCallbackMethod="POST"
                record="record-from-start"
                recordingStatusCallback="{escape(recording_callback)}"
                recordingStatusCallbackEvent="completed">{escape(conference_name)}</Conference>
  </Dial>
</Response>"""
    return Response(content=xml, media_type="application/xml")


@router.post("/{call_id}/redirect-payer")
async def redirect_payer_to_conference(call_id: int, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    call = await _get_call(db, call_id)
    if call is None:
        return {"ok": False, "error": "call_not_found"}
    payer_sid = call.get("twilio_call_sid")
    if not payer_sid:
        await _log_event(db, call_id, "handoff_failed", "no_payer_call_sid")
        await db.commit()
        return {"ok": False, "error": "no_payer_call_sid"}

    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    if not account_sid or not auth_token:
        await _log_event(db, call_id, "handoff_failed", "twilio_not_configured")
        await db.commit()
        return {"ok": False, "error": "twilio_not_configured"}

    twiml_url = f"{_public_base_url(request)}/api/handoff/{call_id}/payer-conference-twiml"
    try:
        _twilio_post(account_sid, auth_token, f"/Calls/{urllib.parse.quote(payer_sid)}.json", {
            "Url": twiml_url,
            "Method": "POST",
        })
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        await _log_event(db, call_id, "handoff_failed", f"twilio_redirect_{exc.code}: {detail[:500]}")
        await db.commit()
        return {"ok": False, "error": f"twilio_redirect_{exc.code}"}
    except Exception as exc:
        await _log_event(db, call_id, "handoff_failed", str(exc))
        await db.commit()
        return {"ok": False, "error": str(exc)}

    await db.execute(
        text("UPDATE calls SET conference_name = COALESCE(conference_name, :conference_name) WHERE id = :call_id"),
        {"call_id": call_id, "conference_name": f"cadence-{call_id}"},
    )
    await _log_event(db, call_id, "ai_dropped", "payer leg redirected into conference; AI stream closed")
    await db.commit()
    return {"ok": True}
