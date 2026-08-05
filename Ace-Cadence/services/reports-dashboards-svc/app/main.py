from fastapi import FastAPI

from common.health import router as health_router

from .routers import reports

app = FastAPI(title="reports-dashboards-svc", version="0.1.0")

app.include_router(health_router)
app.include_router(reports.router)
