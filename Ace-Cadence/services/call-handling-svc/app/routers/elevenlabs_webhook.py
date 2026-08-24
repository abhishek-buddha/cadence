"""ElevenLabs post-call webhook.

Ported from the Render/Convex `cadence_pro_ivr` baseline. ElevenLabs POSTs here
once a conversation ends with the full transcript and call metadata. Without this
route, calls placed through ElevenLabs (the `ivr_only_cut_at_handoff` and
`direct_to_agent` connection types, which dial via the ElevenLabs outbound API
rather than our own Twilio leg) never stored a transcript at all.

Correlation is by the `internal_call_id` dynamic variable we set at call time,
falling back to the ElevenLabs conversation id.

After persisting the transcript this kicks off the OpenAI extraction in
`.analysis.analyze_call`, which populates `call_results` / claim status / outcome
classification — the equivalent of Render's `analyzeTranscript`.

A conversation ending here does NOT mean the call ended: see the guard around
`_close_call` below.
"""

import hashlib
import hmac
import json
import logging
import time

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.db import get_db
from common.serialize import row_to_dict

from ..config import settings
from .analysis import analyze_call
from .eleven_status import _turn_to_line
from .twilio_compat import _LIVE_HANDOFF_STATES, _close_call

logger = logging.getLogger(__name__)

router = APIRouter(tags=["elevenlabs"])

# Reject webhooks whose timestamp is further than this from now, so a captured
# request body cannot be replayed indefinitely.
_MAX_SIGNATURE_AGE_SECONDS = 30 * 60


def _verify_signature(raw_body: bytes, signature_header: str | None) -> bool:
    """Verify the `ElevenLabs-Signature: t=<ts>,v0=<hmac>` header.

    The HMAC covers `<timestamp>.<raw body>`, so the exact bytes received must be
    used — re-serializing the parsed JSON would change the digest.
    """
    secret = settings.elevenlabs_webhook_secret
    if not secret:
        # Nothing to verify against. Refuse rather than accept unauthenticated
        # writes: this endpoint mutates call records.
        logger.error("ELEVENLABS_WEBHOOK_SECRET is not set; rejecting webhook")
        return False
    if not signature_header:
        return False

    timestamp = ""
    provided = ""
    for part in signature_header.split(","):
        key, _, value = part.strip().partition("=")
        if key == "t":
            timestamp = value
        elif key == "v0":
            provided = value
    if not timestamp or not provided:
        return False

    try:
        age = abs(int(time.time()) - int(timestamp))
    except ValueError:
        return False
    if age > _MAX_SIGNATURE_AGE_SECONDS:
        return False

    expected = hmac.new(
        secret.encode(),
        f"{timestamp}.".encode() + raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, provided)


def _flatten_transcript(raw) -> str:
    """ElevenLabs sends transcript as a list of turns; flatten to `role: message`
    lines for storage.

    Keypad presses are turns whose `message` is empty and whose real content sits
    in `tool_calls` (`play_keypad_touch_tone`). Rendering only `message` turned
    every DTMF press into a blank `agent:` line, so a transcript of a keypad IVR
    looked like the agent said nothing while it was in fact navigating menus --
    and that transcript is what `analyze_call` classifies, so a lost keypress can
    change the recorded outcome.

    Reuses `_turn_to_line` rather than repeating the tool-call parsing: the live
    poll and this post-call path must not disagree about what a transcript says.
    """
    if isinstance(raw, str):
        return raw
    if not isinstance(raw, list):
        return ""
    lines = []
    for turn in raw:
        if not isinstance(turn, dict):
            continue
        line = _turn_to_line(turn)
        if line is None:
            # Keep the turn visible even when it carries no message and no tool
            # call, so the shape of the conversation is preserved.
            role = turn.get("role") or turn.get("speaker") or "unknown"
            message = turn.get("message") or turn.get("text") or ""
            line = f"{role}: {message}"
        lines.append(line)
    return "\n".join(lines)


@router.post("/elevenlabs-webhook")
async def elevenlabs_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    raw_body = await request.body()
    signature = request.headers.get("elevenlabs-signature") or request.headers.get("ElevenLabs-Signature")
    if not _verify_signature(raw_body, signature):
        return Response(
            content=json.dumps({"error": "invalid_signature"}),
            status_code=401,
            media_type="application/json",
        )

    try:
        body = json.loads(raw_body.decode())
    except ValueError:
        return Response(
            content=json.dumps({"error": "invalid_json"}),
            status_code=400,
            media_type="application/json",
        )

    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    conversation_id = data.get("conversation_id") or body.get("conversation_id") or body.get("id")
    init_data = (
        data.get("conversation_initiation_client_data")
        or body.get("conversation_initiation_client_data")
        or {}
    )
    dynamic_vars = init_data.get("dynamic_variables") or {}

    transcript = _flatten_transcript(data.get("transcript") or body.get("transcript") or [])
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    duration = metadata.get("call_duration_secs") or data.get("duration") or body.get("duration")

    # Correlate: our own id first, ElevenLabs' conversation id as fallback.
    call_id = None
    raw_internal_id = dynamic_vars.get("internal_call_id")
    if raw_internal_id:
        try:
            call_id = int(raw_internal_id)
        except (TypeError, ValueError):
            call_id = None
    if call_id is None and conversation_id:
        result = await db.execute(
            text("SELECT id FROM calls WHERE eleven_labs_conversation_id = :cid"),
            {"cid": conversation_id},
        )
        row = row_to_dict(result.first())
        if row:
            call_id = row["id"]
    if call_id is None:
        logger.warning("elevenlabs webhook could not correlate conversation %s", conversation_id)
        return Response(
            content=json.dumps({"error": "could_not_correlate_call"}),
            status_code=200,
            media_type="application/json",
        )

    existing = await db.execute(
        text("SELECT id, handoff_state FROM calls WHERE id = :id"), {"id": call_id}
    )
    call = row_to_dict(existing.first())
    if call is None:
        return Response(
            content=json.dumps({"error": "call_not_found"}),
            status_code=200,
            media_type="application/json",
        )

    await db.execute(
        text(
            "UPDATE calls SET transcript = COALESCE(transcript, :transcript), "
            "eleven_labs_conversation_id = COALESCE(eleven_labs_conversation_id, :cid) "
            "WHERE id = :id"
        ),
        {"id": call_id, "transcript": transcript or None, "cid": conversation_id},
    )
    # The ElevenLabs conversation ending is NOT the call ending.
    #
    # In ivr_human_handoff the AI is deliberately dropped at the handoff, so this
    # webhook arrives seconds later while the operator and payer are still
    # talking on the same Twilio leg. Closing here ended live calls ~7s in (the
    # operator's UI flipped to "Call ended · Complete Call") and stamped
    # `duration` with ElevenLabs' `call_duration_secs` — the AI-only span, not
    # the whole call.
    #
    # The conference status callback and the payer leg's own StatusCallback are
    # the real end-signals for that mode. For the ElevenLabs-owned modes
    # (ivr_only_cut_at_handoff, direct_to_agent) no handoff is live and this
    # remains the only close path, so it still runs.
    if call.get("handoff_state") not in _LIVE_HANDOFF_STATES:
        await _close_call(db, call_id=call_id, twilio_status_value="completed", duration=duration)
    await db.commit()

    # Extraction + outcome classification. Best-effort: the transcript is already
    # committed above, so a bad OpenAI response must not cost us the transcript
    # or make ElevenLabs retry the webhook. Re-runnable via
    # POST /calls/{id}/analyze.
    analyzed = None
    if transcript:
        try:
            analyzed = (await analyze_call(db, call_id))["outcome"]
        except Exception as exc:
            logger.warning("post-call analysis failed for call %s: %s", call_id, exc)

    return Response(
        content=json.dumps({"success": True, "callId": call_id, "outcome": analyzed}),
        media_type="application/json",
    )
