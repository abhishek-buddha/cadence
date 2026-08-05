from fastapi import FastAPI

from common.health import router as health_router

from .routers import aggregation, updates

app = FastAPI(title="ui-data-loading-svc", version="0.1.0")

app.include_router(health_router)
app.include_router(aggregation.router)
app.include_router(updates.router)
