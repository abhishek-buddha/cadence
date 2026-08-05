from fastapi import FastAPI

from common.health import router as health_router

from .routers import insurance_contacts, patients, providers

app = FastAPI(title="master-data-svc", version="0.1.0")

app.include_router(health_router)
app.include_router(providers.router)
app.include_router(insurance_contacts.router)
app.include_router(patients.router)
