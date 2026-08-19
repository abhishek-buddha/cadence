"""Call recording + transcription endpoints.

Ported from the Render/Convex `cadence_pro_ivr` baseline, which had
`/twilio-recording-status`, `/twilio-recording-media` and `/twilio-transcription`.
The AWS port dropped all three, so conference recordings were never captured and
the recording players in CallHistory/ClaimDetail had nothing to play.

Media is proxied rather than linked directly because neither provider's media URL
is publicly fetchable: Twilio's requires HTTP Basic auth and ElevenLabs' requires
the `xi-api-key` header. Neither secret may reach the browser, so the browser
hits us and we fetch upstream.
"""

import base64
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.db import get_db
from common.serialize import row_to_dict

from ..config import settings

router = APIRouter(tags=["recordings"])

# Refuse to proxy anything larger than this. A long payer call is a few MB of
# mp3; well past that means we are being pointed somewhere we shouldn't be.
_MAX_MEDIA_BYTES = 64 * 1024 * 1024


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _form(request: Request) -> dict[str, str]:
    raw = (await request.body()).decode(errors="ignore")
    parsed = urllib.parse.parse_qs(raw)
    return {k: v[-1] for k, v in parsed.items() if v}


def _fetch_media(url: str, headers: dict[str, str]) -> tuple[bytes, str] | None:
    """Blocking upstream fetch — callers hand this to a threadpool so the event
    loop keeps serving other requests while a recording downloads."""
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            content_type = response.headers.get("content-type") or "audio/mpeg"
            return response.read(_MAX_MEDIA_BYTES), content_type
    except urllib.error.HTTPError:
        return None
    except Exception:
        return None


def _is_allowed_media_url(raw_url: str, allowed_host_suffix: str) -> bool:
    """SSRF guard. The URL comes out of our own DB, but it originally arrived in
    a webhook body, so it is attacker-influenced input and must be constrained
    to the provider we expect before we fetch it with credentials attached."""
    try:
        parsed = urllib.parse.urlparse(raw_url)
    except Exception:
        return False
    return parsed.scheme == "https" and (parsed.hostname or "").endswith(allowed_host_suffix)


@router.api_route("/twilio-recording-status", methods=["GET", "POST"])
async def twilio_recording_status(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Twilio calls this once the conference recording is ready.

    Stores the media URL against the call, then asks Twilio to transcribe it and
    post the text back to /twilio-transcription. The conference only exists for
    the human<->human portion of a handoff, so this is the human recording.
    """
    data = await _form(request)
    call_id = request.query_params.get("callId") or data.get("callId")
    recording_url = data.get("RecordingUrl") or ""
    recording_sid = data.get("RecordingSid") or ""
    duration = data.get("RecordingDuration")
    if not call_id or not recording_url:
        return {"success": False, "error": "missing_call_id_or_url"}
    call_id = int(call_id)

    # Twilio's RecordingUrl carries no extension; .mp3 is what browsers can play.
    playable_url = f"{recording_url}.mp3"
    await db.execute(
        text(
            "UPDATE calls SET recording_path = COALESCE(recording_path, :url), "
            "human_recording_path = COALESCE(human_recording_path, :url) WHERE id = :id"
        ),
        {"id": call_id, "url": playable_url},
    )
    await db.execute(
        text(
            "INSERT INTO call_events (call_id, type, message, timestamp) "
            "VALUES (:id, 'recording_ready', :message, :now)"
        ),
        {"id": call_id, "message": f"duration={duration or 'unknown'}s", "now": _now()},
    )
    await db.commit()

    # Best-effort: Twilio transcribes and POSTs the text to us. A failure here
    # must not lose the recording we just saved.
    if recording_sid and settings.twilio_account_sid and settings.twilio_auth_token:
        callback = f"{settings.public_base_url.rstrip('/')}/twilio-transcription?callId={call_id}"
        body = urllib.parse.urlencode({"TranscribeCallback": callback}).encode()
        api_url = (
            f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}"
            f"/Recordings/{urllib.parse.quote(recording_sid)}/Transcriptions.json"
        )
        auth = base64.b64encode(
            f"{settings.twilio_account_sid}:{settings.twilio_auth_token}".encode()
        ).decode()
        req = urllib.request.Request(
            api_url,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        try:
            await run_in_threadpool(lambda: urllib.request.urlopen(req, timeout=15).read())
        except Exception:
            pass

    return {"success": True}


@router.post("/twilio-transcription")
async def twilio_transcription(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Twilio posts the recording's transcription text here."""
    data = await _form(request)
    call_id = request.query_params.get("callId") or data.get("callId")
    transcription = data.get("TranscriptionText") or ""
    status = data.get("TranscriptionStatus") or ""
    if call_id and transcription and status == "completed":
        await db.execute(
            text("UPDATE calls SET human_transcript = COALESCE(human_transcript, :t) WHERE id = :id"),
            {"id": int(call_id), "t": transcription},
        )
        await db.commit()
    return {"success": True}


@router.get("/twilio-recording-media")
async def twilio_recording_media(callId: int, db: AsyncSession = Depends(get_db)) -> Response:
    """Authenticated proxy for the Twilio conference recording."""
    result = await db.execute(
        text("SELECT recording_path, human_recording_path FROM calls WHERE id = :id"),
        {"id": callId},
    )
    call = row_to_dict(result.first())
    if call is None:
        return Response(content="Call not found", status_code=404, media_type="text/plain")
    url = call.get("human_recording_path") or call.get("recording_path")
    if not url:
        return Response(content="Recording not found", status_code=404, media_type="text/plain")
    if not _is_allowed_media_url(url, "twilio.com"):
        return Response(content="Invalid recording URL", status_code=400, media_type="text/plain")
    if not (settings.twilio_account_sid and settings.twilio_auth_token):
        return Response(content="Twilio not configured", status_code=503, media_type="text/plain")

    auth = base64.b64encode(
        f"{settings.twilio_account_sid}:{settings.twilio_auth_token}".encode()
    ).decode()
    fetched = await run_in_threadpool(_fetch_media, url, {"Authorization": f"Basic {auth}"})
    if fetched is None:
        return Response(content="Recording fetch failed", status_code=502, media_type="text/plain")
    audio, content_type = fetched
    return Response(
        content=audio,
        media_type=content_type,
        headers={"Accept-Ranges": "bytes", "Cache-Control": "private, max-age=300"},
    )


@router.get("/elevenlabs-recording-media")
async def elevenlabs_recording_media(callId: int, db: AsyncSession = Depends(get_db)) -> Response:
    """Authenticated proxy for the ElevenLabs (AI leg) conversation audio.

    The UI has always pointed at this path; on Render it was served by the
    equivalent Convex route. Keyed on the conversation id stored at call time.
    """
    result = await db.execute(
        text("SELECT eleven_labs_conversation_id, ai_recording_path FROM calls WHERE id = :id"),
        {"id": callId},
    )
    call = row_to_dict(result.first())
    if call is None:
        return Response(content="Call not found", status_code=404, media_type="text/plain")
    conversation_id = call.get("eleven_labs_conversation_id")
    if not conversation_id:
        return Response(content="No AI recording for this call", status_code=404, media_type="text/plain")
    if not settings.elevenlabs_api_key:
        return Response(content="ElevenLabs not configured", status_code=503, media_type="text/plain")

    url = (
        "https://api.elevenlabs.io/v1/convai/conversations/"
        f"{urllib.parse.quote(str(conversation_id))}/audio"
    )
    fetched = await run_in_threadpool(_fetch_media, url, {"xi-api-key": settings.elevenlabs_api_key})
    if fetched is None:
        return Response(content="Recording fetch failed", status_code=502, media_type="text/plain")
    audio, content_type = fetched
    return Response(
        content=audio,
        media_type=content_type,
        headers={"Accept-Ranges": "bytes", "Cache-Control": "private, max-age=300"},
    )
