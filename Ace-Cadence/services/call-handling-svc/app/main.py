from fastapi import FastAPI

from common.health import router as health_router

from .routers import call_events, call_results, call_sessions, call_settings, calls, claims

app = FastAPI(title="call-handling-svc", version="0.1.0")

app.include_router(health_router)
app.include_router(claims.router)
app.include_router(call_sessions.router)
app.include_router(calls.router)
app.include_router(call_results.router)
app.include_router(call_events.router)
app.include_router(call_settings.router)
