"""In-process registry of browser /listen/{call_id} WebSocket connections,
ported from the Node bridge's `browserListeners` Map. Audio/event chunks
received from ElevenLabs' monitor socket are fanned out to every browser
tab currently watching that call."""

from fastapi import WebSocket

_listeners: dict[int, set[WebSocket]] = {}


def register_listener(call_id: int, websocket: WebSocket) -> None:
    _listeners.setdefault(call_id, set()).add(websocket)


def unregister_listener(call_id: int, websocket: WebSocket) -> None:
    listeners = _listeners.get(call_id)
    if listeners is None:
        return
    listeners.discard(websocket)
    if not listeners:
        _listeners.pop(call_id, None)


async def forward_to_listeners(call_id: int, payload: str) -> None:
    for websocket in list(_listeners.get(call_id, ())):
        try:
            await websocket.send_text(payload)
        except Exception:
            unregister_listener(call_id, websocket)
