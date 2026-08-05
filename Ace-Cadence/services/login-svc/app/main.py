from fastapi import FastAPI

from common.health import router as health_router

from .routers import auth

app = FastAPI(title="login-svc", version="0.1.0")

app.include_router(health_router)
app.include_router(auth.router)
