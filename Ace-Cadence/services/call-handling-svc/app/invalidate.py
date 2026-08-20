"""Publish UI invalidation events so open browser tabs refetch after a write.

`ui-data-loading-svc` already exposes both halves of the intended
"invalidate + refetch" reactivity (a POST /invalidate publisher and a
/ws/updates Redis relay), but nothing in the codebase ever published to the
channel and nothing in the UI ever subscribed — so every screen outside the
handful of polled queries showed data frozen at mount time.

This publishes straight to the same Redis channel rather than doing an HTTP hop
through ui-data-loading-svc's /invalidate: same effect, one less network call and
one less failure mode on a path that must never break the write it follows.

Deliberately NOT placed in base-image/common/: `deploy.sh` never rebuilds
`ace-cadence-base`, so a new module there would not exist in the deployed image
and would crash every service on import.
"""

import json
import logging

from common.redis_client import get_pubsub_client

logger = logging.getLogger(__name__)

# Must match _CHANNEL in ui-data-loading-svc/app/routers/updates.py.
_CHANNEL = "ui-updates"


async def publish_invalidation(entity_type: str, entity_id: str | int | None = None) -> None:
    """Best-effort fan-out. Never raises: a dropped live update is a cosmetic
    problem, whereas failing the surrounding request would lose real data."""
    try:
        client = get_pubsub_client()
        try:
            await client.publish(
                _CHANNEL,
                json.dumps({
                    "entity_type": entity_type,
                    "entity_id": str(entity_id) if entity_id is not None else None,
                }),
            )
        finally:
            await client.aclose()
    except Exception as exc:
        logger.warning("invalidation publish failed (%s/%s): %s", entity_type, entity_id, exc)
