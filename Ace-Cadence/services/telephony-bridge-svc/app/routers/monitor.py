import asyncio
import json
from datetime import datetime, timezone

import httpx
import websockets
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from ..config import settings
from ..connections import forward_to_listeners, register_listener, unregister_listener

router = APIRouter(tags=["monitor"])


async def _post_call_event(call_id: int, event_type: str, message: str | None) -> None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            await client.post(
                f"{settings.call_handling_svc_url}/call-events",
                json={
                    "call_id": call_id,
                    "type": event_type,
                    "message": message,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )
        except httpx.HTTPError:
            pass  # best-effort — a dropped event shouldn't kill the monitor loop


async def _run_monitor(conversation_id: str, call_id: int) -> None:
    """Connects to ElevenLabs' conversation monitor socket and forwards
    transcript/tool-call events to call-handling-svc's /call-events, and raw
    audio chunks to any browser tabs watching this call via /listen/{call_id}.
    Ported from the Node bridge's /start-monitor handler."""
    monitor_url = f"wss://api.elevenlabs.io/v1/convai/conversations/{conversation_id}/monitor"
    try:
        async with websockets.connect(
            monitor_url, additional_headers={"xi-api-key": settings.elevenlabs_api_key}
        ) as monitor_ws:
            async for raw in monitor_ws:
                try:
                    msg = json.loads(raw)
                except (TypeError, ValueError):
                    continue

                msg_type = msg.get("type")
                if msg_type in ("audio", "audio_event"):
                    audio = (
                        (msg.get("audio") or {}).get("chunk")
                        or (msg.get("audio_event") or {}).get("audio_base_64")
                    )
                    if audio:
                        await forward_to_listeners(call_id, audio)
                    continue

                event_type, message = None, None
                if msg_type in ("user_transcript", "user_transcription_event"):
                    event_type = "user_transcript"
                    message = (msg.get("user_transcription_event") or {}).get("user_transcript", "")
                elif msg_type in ("agent_response", "agent_response_event"):
                    event_type = "agent_response"
                    message = (msg.get("agent_response_event") or {}).get("agent_response", "")
                elif msg_type in ("tool_call", "client_tool_call"):
                    event_type = "tool_call"
                    message = msg.get("tool_name") or "DTMF"
                elif msg_type == "conversation_initiation_metadata":
                    event_type = "status"
                    message = "Call connected"

                if event_type:
                    await _post_call_event(call_id, event_type, message)
    except (websockets.WebSocketException, OSError):
        pass


@router.post("/start-monitor")
async def start_monitor(body: dict) -> dict:
    for field in ("conversation_id", "call_id"):
        if field not in body:
            raise HTTPException(status_code=422, detail=f"Missing field: {field}")
    asyncio.create_task(_run_monitor(body["conversation_id"], body["call_id"]))
    return {"success": True, "monitoring": body["conversation_id"]}


@router.websocket("/listen/{call_id}")
async def listen(websocket: WebSocket, call_id: int) -> None:
    """A browser tab's live-transcript/audio subscription for one call —
    replaces the current app's bridge `/listen/:callId` socket."""
    await websocket.accept()
    register_listener(call_id, websocket)
    try:
        while True:
            await websocket.receive_text()  # client sends nothing meaningful; just keeps the socket open
    except WebSocketDisconnect:
        pass
    finally:
        unregister_listener(call_id, websocket)
