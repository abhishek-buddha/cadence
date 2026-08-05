import json

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from common.redis_client import get_pubsub_client

router = APIRouter(tags=["updates"])

_CHANNEL = "ui-updates"


@router.post("/invalidate")
async def publish_invalidation(body: dict) -> dict:
    """Called by other services after a write, so every connected frontend
    tab refetches the affected entity type instead of polling (the
    "invalidate + refetch" pattern from the architecture plan — a
    deliberate simplification of Convex's per-query reactivity). Body shape:
    {"entity_type": "claim", "entity_id": "123"}."""
    if "entity_type" not in body:
        raise HTTPException(status_code=422, detail="Missing field: entity_type")
    client = get_pubsub_client()
    await client.publish(
        _CHANNEL, json.dumps({"entity_type": body["entity_type"], "entity_id": body.get("entity_id")})
    )
    await client.aclose()
    return {"success": True}


@router.websocket("/ws/updates")
async def stream_updates(websocket: WebSocket) -> None:
    await websocket.accept()
    client = get_pubsub_client()
    pubsub = client.pubsub()
    await pubsub.subscribe(_CHANNEL)
    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            await websocket.send_text(message["data"])
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(_CHANNEL)
        await pubsub.aclose()
        await client.aclose()
