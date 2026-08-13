from fastapi import FastAPI

from common.health import router as health_router

from .routers import media_stream, monitor, twiml

app = FastAPI(title="telephony-bridge-svc", version="0.1.0")

app.include_router(health_router)
app.include_router(monitor.router)
app.include_router(twiml.router)
app.include_router(media_stream.router)
