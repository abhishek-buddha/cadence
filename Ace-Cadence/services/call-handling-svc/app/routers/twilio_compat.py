import base64
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from html import escape

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.db import get_db, AsyncSessionLocal
from common.serialize import row_to_dict, rows_to_dicts

from ..config import settings
from ..invalidate import publish_invalidation
from .calls import _claim_context, _dynamic_vars
from .handoff import find_available_operator

router = APIRouter(tags=["twilio-compat"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _form(request: Request) -> dict[str, str]:
    raw = (await request.body()).decode(errors="ignore")
    parsed = urllib.parse.parse_qs(raw)
    return {k: v[-1] for k, v in parsed.items() if v}


def _base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _sign_twilio_access_token(identity: str, ttl_seconds: int = 3600) -> str:
    now = int(time.time())
    header = {"typ": "JWT", "alg": "HS256", "cty": "twilio-fpa;v=1"}
    payload = {
        "jti": f"{settings.twilio_api_key}-{now}",
        "iss": settings.twilio_api_key,
        "sub": settings.twilio_account_sid,
        "iat": now,
        "exp": now + ttl_seconds,
        "grants": {
            "identity": identity,
            "voice": {
                "outgoing": {"application_sid": settings.twilio_twiml_app_sid},
                "incoming": {"allow": True},
            },
        },
    }
    signing_input = (
        _base64url(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + _base64url(json.dumps(payload, separators=(",", ":")).encode())
    )
    signature = hmac.new(
        settings.twilio_api_secret.encode(),
        signing_input.encode(),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{_base64url(signature)}"


@router.get("/twilio-voice-token")
@router.post("/twilio-voice-token")
async def twilio_voice_token(request: Request) -> Response:
    if not (
        settings.twilio_account_sid
        and settings.twilio_api_key
        and settings.twilio_api_secret
        and settings.twilio_twiml_app_sid
    ):
        return Response(
            content=json.dumps(
                {
                    "error": {
                        "code": "softphone_not_configured",
                        "message": "Browser softphone not configured. Set TWILIO_API_KEY, TWILIO_API_SECRET, and TWILIO_TWIML_APP_SID in AWS env.",
                    }
                }
            ),
            status_code=503,
            media_type="application/json",
        )

    identity = request.query_params.get("identity") or f"agent-{int(time.time())}"
    token = _sign_twilio_access_token(identity)
    return Response(
        content=json.dumps({"token": token, "identity": identity}),
        media_type="application/json",
    )


@router.api_route("/twiml-softphone-outgoing", methods=["GET", "POST"])
async def twiml_softphone_outgoing(request: Request) -> Response:
    call_id = request.query_params.get("callId") or ""
    if not call_id:
        form = await _form(request)
        call_id = form.get("callId") or ""
    conference_name = f"cadence-{call_id}"
    # statusCallback here as well as on the payer leg — Render declares it on
    # both, so a conference still reports leave/end if the operator's leg is the
    # one that survives (e.g. payer redirect raced or failed).
    status_callback = f"{settings.public_base_url.rstrip('/')}/twilio-conference-status?callId={call_id}"
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false"
                statusCallback="{escape(status_callback)}"
                statusCallbackEvent="start end join leave"
                statusCallbackMethod="POST">{escape(conference_name)}</Conference>
  </Dial>
</Response>'''
    return Response(content=xml, media_type="application/xml")


@router.api_route("/twiml-conference-hold", methods=["GET", "POST"])
async def twiml_conference_hold() -> Response:
    """Hold audio (the conference waitUrl) played to the payer's rep while they
    wait for a Cadence operator to accept. Without this Twilio falls back to its
    default hold music, which sounds nothing like a billing office."""
    xml = '''<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold. Connecting you to a specialist now.</Say>
  <Play loop="0">https://sdk.twilio.com/js/client/sounds/releases/1.0.0/ringtone.mp3</Play>
</Response>'''
    return Response(content=xml, media_type="application/xml")


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
    agent = await find_available_operator(db)
    # A human answering ends the hold. hold_duration is derived here rather than
    # sent by the bridge so the clock is always the DB's, and TIMESTAMPDIFF
    # leaves it NULL when no hold was ever recorded.
    await db.execute(
        text("""
        UPDATE calls
        SET handoff_state = 'awaiting_human', handoff_requested_at = :now,
            human_detected_at = COALESCE(human_detected_at, :now), handoff_reason = :reason,
            conference_name = COALESCE(conference_name, :conference),
            call_phase = 'connecting',
            hold_duration = COALESCE(hold_duration, TIMESTAMPDIFF(SECOND, hold_started_at, :now)),
            assigned_agent_user_id = COALESCE(assigned_agent_user_id, :agent_id),
            assigned_agent_email = COALESCE(assigned_agent_email, :agent_email),
            assigned_agent_name = COALESCE(assigned_agent_name, :agent_name)
        WHERE id = :id AND (handoff_state IS NULL OR handoff_state NOT IN ('awaiting_human', 'accepting', 'connected', 'handoff_ended'))
        """),
        {
            "id": int(call_id), "now": _now(), "reason": reason,
            "conference": f"cadence-{call_id}",
            "agent_id": agent["id"] if agent else None,
            "agent_email": agent["email"] if agent else None,
            "agent_name": agent["display_name"] if agent else None,
        },
    )
    detail = (
        f"{reason}; assigned to {agent['display_name']}" if agent else f"{reason}; no available agent"
    )
    await db.execute(
        text("INSERT INTO call_events (call_id, type, message, timestamp) VALUES (:id, 'handoff_requested', :reason, :now)"),
        {"id": int(call_id), "reason": detail, "now": _now()},
    )
    await db.commit()
    await publish_invalidation("call", call_id)
    return {"ok": True, "callId": call_id, "assignedTo": agent["display_name"] if agent else None}


@router.post("/call-artifacts")
async def call_artifacts(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Bridge reports back what only it knows about a Mode A call.

    For `ivr_human_handoff` the ElevenLabs conversation is opened by the bridge
    (signed URL), so the app never learned its id, and the transcript lived only
    in the bridge's logs. Consequences: Call History had no transcript and no AI
    recording to play, and the analysis pipeline had nothing to analyse.

    Both fields are COALESCEd, so a later ElevenLabs post-call webhook cannot be
    overwritten by a partial report and vice versa.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    call_id = request.query_params.get("callId") or body.get("callId")
    if not call_id:
        return {"ok": False, "error": "missing_call_id"}
    conversation_id = body.get("conversation_id") or body.get("conversationId")
    transcript = body.get("transcript")
    if not conversation_id and not transcript:
        return {"ok": False, "error": "nothing_to_record"}

    result = await db.execute(
        text(
            "UPDATE calls SET "
            "eleven_labs_conversation_id = COALESCE(eleven_labs_conversation_id, :cid), "
            "transcript = COALESCE(transcript, :transcript) "
            "WHERE id = :id"
        ),
        {"id": int(call_id), "cid": conversation_id, "transcript": transcript or None},
    )
    await db.commit()
    if result.rowcount:
        await publish_invalidation("call", call_id)
    return {"ok": True, "callId": call_id}


@router.api_route("/call-hold-start", methods=["GET", "POST"])
async def call_hold_start(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Bridge reports that the payer IVR announced a transfer/hold.

    This is the only way hold metrics can be captured on AWS: Render measured
    hold via its `/twiml-hold-loop` TwiML, which cannot exist here because
    `<Connect><Stream>` is terminal (see the notes' parity section). The bridge
    is watching the transcript anyway, so it is the one component that knows
    when hold started. Without this, /reports/hold-metrics has no data at all.
    """
    call_id = request.query_params.get("callId") or request.query_params.get("call_id")
    if not call_id:
        return {"ok": False, "error": "missing_call_id"}
    result = await db.execute(
        text(
            "UPDATE calls SET call_phase = 'hold', hold_started_at = COALESCE(hold_started_at, :now) "
            "WHERE id = :id AND hold_started_at IS NULL"
        ),
        {"id": int(call_id), "now": _now()},
    )
    if result.rowcount:
        await db.execute(
            text(
                "INSERT INTO call_events (call_id, type, message, timestamp) "
                "VALUES (:id, 'hold_started', 'payer IVR announced transfer/hold', :now)"
            ),
            {"id": int(call_id), "now": _now()},
        )
    await db.commit()
    return {"ok": True, "callId": call_id, "recorded": bool(result.rowcount)}


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


_FINAL_TWILIO_STATUSES = {"completed", "failed", "busy", "no-answer", "canceled"}

# Handoff states that mean "this call is still live with an operator". A call
# that ends while in one of these must be moved out of them, or the operator UI
# (which keys off handoff_state, not status) stays parked on a dead call.
_LIVE_HANDOFF_STATES = ("awaiting_human", "accepting", "connected")
# Inlined rather than a bound param: SQLAlchemy needs expanding=True to expand a
# sequence into an IN list, and these are fixed internal constants (no user input).
_LIVE_HANDOFF_STATES_SQL = ", ".join(f"'{state}'" for state in _LIVE_HANDOFF_STATES)


async def _close_call(
    db: AsyncSession,
    *,
    sid: str | None = None,
    call_id: int | None = None,
    twilio_status_value: str = "completed",
    duration: str | None = None,
) -> int | None:
    """The single path every call-end signal routes through — the payer leg's
    StatusCallback, the conference status callback, and the reconcile loop.

    Mirrors the Render/Convex `closeHandoffCall()`: finalize status AND release
    a live handoff. Doing only the former (the previous behavior here) left
    handoff_state stuck at connected/awaiting_human, so the operator queue and
    handoff timeline never noticed the call was over.

    Returns the affected call id, or None when no call matched — callers use it
    to publish a UI invalidation for the right call.
    """
    if call_id is None:
        if not sid:
            return None
        result = await db.execute(text("SELECT id FROM calls WHERE twilio_call_sid = :sid"), {"sid": sid})
        row = row_to_dict(result.first())
        if row is None:
            return None
        call_id = row["id"]

    final = "completed" if twilio_status_value == "completed" else "failed"
    await db.execute(
        text(
            "UPDATE calls SET status = :final, completed_at = COALESCE(completed_at, :now) "
            "WHERE id = :id AND completed_at IS NULL"
        ),
        {"id": call_id, "final": final, "now": _now()},
    )
    # Duration is settled separately from the status, NOT in the same
    # first-close-wins statement.
    #
    # Several signals race to close a call and only some carry a duration: the
    # conference status callback (participant-leave) usually lands first with
    # none, and the payer leg's own StatusCallback arrives later carrying
    # CallDuration. Folding both into one `WHERE completed_at IS NULL` update
    # meant the first close won and duration stayed NULL forever.
    #
    # Falling back to the DB's own started_at -> completed_at span means every
    # closed call gets a duration covering the whole call (agent<->IVR, then
    # rep<->agent, then rep<->operator), rather than only the legs Twilio
    # happened to report.
    await db.execute(
        text(
            "UPDATE calls SET duration = COALESCE(:duration, "
            "TIMESTAMPDIFF(SECOND, started_at, COALESCE(completed_at, :now))) "
            "WHERE id = :id AND duration IS NULL"
        ),
        {"id": call_id, "duration": duration, "now": _now()},
    )
    released = await db.execute(
        text(
            "UPDATE calls SET handoff_state = 'handoff_ended' "
            f"WHERE id = :id AND handoff_state IN ({_LIVE_HANDOFF_STATES_SQL})"
        ),
        {"id": call_id},
    )
    if released.rowcount:
        await db.execute(
            text(
                "INSERT INTO call_events (call_id, type, message, timestamp) "
                "VALUES (:id, 'handoff_ended', :message, :now)"
            ),
            {"id": call_id, "message": f"call ended ({twilio_status_value})", "now": _now()},
        )
    return call_id


@router.post("/twilio-status")
async def twilio_status(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    data = await _form(request)
    sid = data.get("CallSid")
    status = data.get("CallStatus")
    if sid and status in _FINAL_TWILIO_STATUSES:
        closed_id = await _close_call(db, sid=sid, twilio_status_value=status, duration=data.get("CallDuration"))
        await db.commit()
        if closed_id:
            await publish_invalidation("call", closed_id)
    return {"success": True}


@router.api_route("/twilio-conference-status", methods=["GET", "POST"])
async def twilio_conference_status(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Conference participant/lifecycle events — the *immediate* end signal once
    the payer has been redirected into the conference for a human handoff.

    Post-handoff the AI stream is gone and the payer leg lives inside the
    conference, so a phone-side hangup surfaces here as participant-leave /
    conference-end. Without this route the app had to wait for the payer leg's
    own StatusCallback (and the bridge's /call-ended deliberately no-ops during
    a handoff), which is why the UI looked stuck as in-progress.
    """
    data = await _form(request)
    call_id = request.query_params.get("callId") or data.get("callId")
    if not call_id:
        return {"success": False, "error": "missing_call_id"}
    call_id = int(call_id)
    event = data.get("StatusCallbackEvent") or ""

    if event == "conference-end":
        await _close_call(db, call_id=call_id)
        await db.commit()
        await publish_invalidation("call", call_id)
        return {"success": True, "closed": True}

    if event == "participant-leave":
        result = await db.execute(
            text("SELECT twilio_call_sid, human_participant_call_sid, handoff_state FROM calls WHERE id = :id"),
            {"id": call_id},
        )
        call = row_to_dict(result.first())
        if call is None:
            return {"success": False, "error": "call_not_found"}
        left_sid = data.get("CallSid") or data.get("ParticipantCallSid") or data.get("ParticipantSid") or ""
        # Either real participant leaving ends the human<->human conversation.
        is_principal = left_sid and left_sid in {
            call.get("twilio_call_sid"),
            call.get("human_participant_call_sid"),
        }
        if is_principal and call.get("handoff_state") in _LIVE_HANDOFF_STATES:
            await _close_call(db, call_id=call_id)
            await db.commit()
            await publish_invalidation("call", call_id)
            return {"success": True, "closed": True}

    return {"success": True}


def _twilio_get_call_status(sid: str) -> dict:
    """GET the live Twilio Call resource. Used only as a reconcile fallback —
    the StatusCallback webhook above is the primary path."""
    req = urllib.request.Request(
        f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Calls/{urllib.parse.quote(sid)}.json",
        headers={"Authorization": "Basic " + base64.b64encode(f"{settings.twilio_account_sid}:{settings.twilio_auth_token}".encode()).decode()},
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.loads(response.read().decode())


async def reconcile_stale_calls() -> None:
    """Self-healing safety net for calls stuck as 'initiating'/'in_progress'
    when a Twilio StatusCallback was missed (nginx blip, network drop, call
    killed manually). Twilio is the source of truth here, not our webhook
    delivery. Runs on a timer from main.py's startup task, well inside the
    30-minute staleness window the UI otherwise falls back to."""
    if not (settings.twilio_account_sid and settings.twilio_auth_token):
        return
    async with AsyncSessionLocal() as db:
        cutoff = _now() - timedelta(minutes=3)
        result = await db.execute(
            text(
                "SELECT id, twilio_call_sid FROM calls "
                "WHERE status IN ('initiating', 'in_progress') AND twilio_call_sid IS NOT NULL "
                "AND started_at <= :cutoff"
            ),
            {"cutoff": cutoff},
        )
        rows = rows_to_dicts(result)
        for row in rows:
            sid = row["twilio_call_sid"]
            try:
                twilio_call = _twilio_get_call_status(sid)
            except urllib.error.HTTPError:
                continue
            except Exception:
                continue
            status = twilio_call.get("status")
            if status in _FINAL_TWILIO_STATUSES:
                await _close_call(db, call_id=row["id"], twilio_status_value=status, duration=twilio_call.get("duration"))
        if rows:
            await db.commit()