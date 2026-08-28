"""Live status + transcript for calls where ElevenLabs owns the phone leg.

`ivr_only_cut_at_handoff` and `direct_to_agent` dial through the ElevenLabs
outbound API rather than our own Twilio leg, so `cadence-bridge` is not in the
media path: there is no `/listen/<callId>` socket, no live audio, and nothing
ever wrote a transcript during the call. The Live Call Monitor was already built
for this — it polls `callActions.getCallStatus` every 3s and renders
`polledData.transcript` (`LiveCallMonitor.jsx:95-155`) — but that action was
never ported, so the compat dispatcher returned `undefined` and the panel sat on
"Waiting for transcript data..." forever.

This is the missing half. It proxies ElevenLabs' conversation resource, which
returns the transcript accumulated so far along with a status.

Live *audio* is not achievable on this path and is not attempted: ElevenLabs
owns the media and we are not a participant. Render has no live audio here
either.

Ported from `cadence_pro_ivr` `callActions.getCallStatus`, with the completion
side routed through `_close_call` so it settles status/duration/handoff_state the
same way every other end-signal on AWS does.
"""

import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.db import get_db
from common.serialize import row_to_dict

from ..config import settings
from ..handoff_states import LIVE_HANDOFF_STATES
from ..invalidate import publish_invalidation
from .analysis import analyze_call
from .twilio_compat import _close_call

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/calls", tags=["eleven-status"])

_TERMINAL = ("done", "failed")


def _fetch_conversation(conversation_id: str) -> dict | None:
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/convai/conversations/"
        + urllib.parse.quote(conversation_id),
        headers={"xi-api-key": settings.elevenlabs_api_key},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        # 404 while the conversation is still being created is normal right after
        # dialing; the UI polls again in 3s.
        logger.info("elevenlabs conversation %s: HTTP %s", conversation_id, exc.code)
        return None
    except Exception as exc:
        logger.warning("elevenlabs conversation %s: %s", conversation_id, exc)
        return None


def _turn_message(turn: dict) -> str | None:
    """What a transcript turn actually says, or None if it says nothing.

    Single source of truth for reading a turn, used by the stored transcript,
    the post-call webhook, and the live poll's JSON response. They must not
    disagree about what a call contained.

    A keypad press carries no `message` -- the content is in `tool_calls`
    (`play_keypad_touch_tone`). Reading only `message` renders it as an empty
    agent turn, which is why the agent looked silent while it was navigating
    menus.
    """
    for call in turn.get("tool_calls") or []:
        if not call.get("tool_has_been_called"):
            continue
        if call.get("tool_name") != "play_keypad_touch_tone":
            continue
        try:
            params = json.loads(call.get("params_as_json") or "{}")
        except ValueError:
            continue
        tones = params.get("dtmf_tones")
        if tones:
            return f"[pressed {tones}] {params.get('reason') or ''}".strip()

    message = turn.get("message")
    if not message or message == "...":
        return None
    return message


def _turn_to_line(turn: dict) -> str | None:
    """One transcript turn as a stored `role: message` line."""
    message = _turn_message(turn)
    if message is None:
        return None
    # A keypad press is always the agent, whatever role the turn claims.
    role = "agent" if message.startswith("[pressed ") else (turn.get("role") or "unknown")
    return f"{role}: {message}"


@router.get("/{call_id}/eleven-status")
async def eleven_status(call_id: int, db: AsyncSession = Depends(get_db)) -> dict | None:
    """Poll target for the Live Call Monitor on ElevenLabs-owned legs.

    The conversation id is read from the call row rather than taken from the
    client, so a caller cannot pull an arbitrary conversation out of the
    workspace by guessing ids.
    """
    if not settings.elevenlabs_api_key:
        raise HTTPException(status_code=503, detail="ElevenLabs not configured")

    result = await db.execute(
        text(
            "SELECT id, claim_id, status, handoff_state, transcript, eleven_labs_conversation_id "
            "FROM calls WHERE id = :id"
        ),
        {"id": call_id},
    )
    call = row_to_dict(result.first())
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    conversation_id = call.get("eleven_labs_conversation_id")
    if not conversation_id:
        return None

    data = _fetch_conversation(conversation_id)
    if data is None:
        return None

    turns = data.get("transcript") or []
    status = data.get("status") or ""

    # One line per poll, so whether ElevenLabs serves partial transcripts
    # mid-call is answerable from the logs instead of argued about. Turn count
    # rising while status is still in-progress means it does; staying at 0 until
    # status flips to done means it does not, and the only route is the
    # (enterprise-gated) monitor WebSocket.
    #   docker compose logs call-handling-svc | grep eleven-poll
    logger.info(
        "eleven-poll call=%s status=%s turns=%d call_status=%s",
        call_id, status or "?", len(turns), call.get("status"),
    )
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    duration = metadata.get("call_duration_secs")

    # Persist progressively, not only at the end. A transcript that exists only
    # in this response is lost the moment the operator closes the tab, and the
    # post-call webhook is the sole other source on this path.
    transcript_text = "\n".join(line for line in (_turn_to_line(t) for t in turns) if line)
    if transcript_text:
        await db.execute(
            text("UPDATE calls SET transcript = :transcript WHERE id = :id"),
            {"id": call_id, "transcript": transcript_text},
        )
        await db.commit()

    # A finished ElevenLabs conversation does NOT mean the call is over.
    #
    # In ivr_human_handoff the AI is deliberately dropped at the handoff, so the
    # conversation ends there while the operator and payer keep talking on the
    # same Twilio leg. Closing here killed live calls ~8s after Accept: the poll
    # saw status "done", _close_call released the handoff and then
    # _hangup_operator_leg terminated the operator's browser leg, whose
    # endConferenceOnExit="true" tore down the conference and dropped the payer
    # too (call 3757: conversation done at 12:22:50.8, operator leg gone, payer
    # gone). This is the same trap already guarded in elevenlabs_webhook.py --
    # the conversation lifecycle and the call lifecycle are different things.
    #
    # For the ElevenLabs-owned modes no handoff is ever live, so this remains
    # their close path and still runs.
    live_handoff = call.get("handoff_state") in LIVE_HANDOFF_STATES
    if status in _TERMINAL and not live_handoff and call.get("status") not in ("completed", "failed"):
        await _close_call(
            db,
            call_id=call_id,
            twilio_status_value="completed" if status == "done" else "failed",
            duration=str(duration) if duration else None,
        )
        await db.commit()
        await publish_invalidation("call", call_id)
        # Analysis is idempotent (skips an already-classified call), so racing
        # with the post-call webhook costs nothing.
        if transcript_text:
            try:
                await analyze_call(db, call_id)
            except Exception as exc:
                logger.warning("analysis failed for call %s: %s", call_id, exc)

    analysis = data.get("analysis") if isinstance(data.get("analysis"), dict) else None
    return {
        "status": status,
        "duration": duration or 0,
        # Rendered through the same reader as the stored transcript, so keypad
        # presses show up live instead of only appearing in call history after
        # the call. The UI drops turns whose message is null, and a DTMF turn
        # has no `message` of its own.
        "transcript": [
            {
                "role": "agent" if (_turn_message(t) or "").startswith("[pressed ") else t.get("role"),
                "message": _turn_message(t),
            }
            for t in turns
        ],
        "analysis": (
            {
                "successful": analysis.get("call_successful"),
                "summary": analysis.get("transcript_summary"),
            }
            if analysis
            else None
        ),
    }
