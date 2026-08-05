from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["media-stream"])


@router.websocket("/media-stream")
async def media_stream(websocket: WebSocket) -> None:
    """Twilio's <Connect><Stream> leg connects here, sending/receiving
    G.711 mu-law audio frames as JSON-wrapped base64 (the `start`/`media`/
    `stop` event protocol). The full relay — piping audio to/from
    ElevenLabs' conversational WebSocket and synthesizing DTMF tones via
    the stdlib `audioop` module — is a direct port of the Node bridge's
    `handleMediaStream` and is the next implementation pass; this route
    just establishes the connection so Twilio has somewhere to stream to."""
    await websocket.accept()
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
