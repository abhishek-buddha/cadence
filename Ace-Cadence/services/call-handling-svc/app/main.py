import asyncio
import logging

from fastapi import FastAPI

from common.health import router as health_router

from .routers import call_events, call_results, call_sessions, call_settings, calls, claims, elevenlabs_webhook, handoff, recordings, twilio_compat
from .routers.twilio_compat import reconcile_stale_calls

logger = logging.getLogger(__name__)

app = FastAPI(title="call-handling-svc", version="0.1.0")

app.include_router(health_router)
app.include_router(claims.router)
app.include_router(call_sessions.router)
app.include_router(calls.router)
app.include_router(call_results.router)
app.include_router(call_events.router)
app.include_router(call_settings.router)
app.include_router(handoff.router)
app.include_router(twilio_compat.router)
app.include_router(recordings.router)
app.include_router(elevenlabs_webhook.router)


@app.on_event("startup")
async def _start_reconcile_loop() -> None:
    async def loop() -> None:
        while True:
            try:
                await reconcile_stale_calls()
            except Exception:
                logger.exception("reconcile_stale_calls failed")
            await asyncio.sleep(60)

    asyncio.create_task(loop())
