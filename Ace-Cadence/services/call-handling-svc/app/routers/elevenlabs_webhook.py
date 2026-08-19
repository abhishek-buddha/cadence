"""ElevenLabs post-call webhook.

Ported from the Render/Convex `cadence_pro_ivr` baseline. ElevenLabs POSTs here
once a conversation ends with the full transcript and call metadata. Without this
route, calls placed through ElevenLabs (the `real_ivr_cut_call` and
`direct_to_agent` connection types, which dial via the ElevenLabs outbound API
rather than our own Twilio leg) never stored a transcript at all.

Correlation is by the `internal_call_id` dynamic variable we set at call time,
falling back to the ElevenLabs conversation id.

NOTE: this deliberately stops at persisting the transcript. Render additionally
kicked off an OpenAI extraction (`analyzeTranscript`) that populates
`call_results` / claim status / outcome classification. That pipeline does not
exist on AWS yet and is tracked as its own work item — see the parity section of
CADENCE_WORKING_NOTES.md. Storing the transcript is its prerequisite.
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
from .twilio_compat import _close_call

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
    """ElevenLabs sends transcript as a list of turns; Render flattened it to
    `role: message` lines and stored that."""
    if isinstance(raw, str):
        return raw
    if not isinstance(raw, list):
        return ""
    lines = []
    for turn in raw:
        if not isinstance(turn, dict):
            continue
        role = turn.get("role") or turn.get("speaker") or "unknown"
        message = turn.get("message") or turn.get("text") or ""
        lines.append(f"{role}: {message}")
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

    exists = await db.execute(text("SELECT id FROM calls WHERE id = :id"), {"id": call_id})
    if row_to_dict(exists.first()) is None:
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
    # Same close path as every other end-signal, so status/handoff_state stay
    # consistent no matter which side reports the call over first.
    await _close_call(db, call_id=call_id, twilio_status_value="completed", duration=duration)
    await db.commit()

    return Response(
        content=json.dumps({"success": True, "callId": call_id}),
        media_type="application/json",
    )
