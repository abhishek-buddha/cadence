"""Shared Redis client factories.

Two separate logical connections by design (see architecture plan): Redis db
0 is Celery's broker/backend, db 1 is the pub/sub fan-out backbone for
WebSocket updates. Kept on separate DB indexes so debugging/flushing one
never disturbs the other.
"""

import redis.asyncio as aioredis

from common.config import CommonSettings

_settings = CommonSettings()


def get_pubsub_client() -> aioredis.Redis:
    """Async Redis client for pub/sub (live-update fan-out, /ws/* endpoints)."""
    return aioredis.from_url(_settings.redis_pubsub_url, decode_responses=True)
