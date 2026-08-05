from fastapi import FastAPI

from common.health import router as health_router

from .routers import user_groups, users

app = FastAPI(title="user-management-svc", version="0.1.0")

app.include_router(health_router)
app.include_router(users.router)
app.include_router(user_groups.router)
