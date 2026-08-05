"""Reusable /health endpoint every service mounts. Checks real DB
connectivity (not just "the process is alive") so a broken DB connection
shows up in Docker's healthcheck / a load balancer probe immediately."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.db import get_db

router = APIRouter()


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)) -> dict:
    await db.execute(text("SELECT 1"))
    return {"status": "ok"}
