from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.db import get_db
from common.serialize import row_to_dict, rows_to_dicts

router = APIRouter(prefix="/call-events", tags=["call-events"])


@router.get("")
async def list_call_events(call_id: int, db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Read by the live call-monitor UI while a call is in progress — no
    audit logging here, this is a high-frequency, append-only stream."""
    result = await db.execute(
        text("SELECT * FROM call_events WHERE call_id = :call_id ORDER BY timestamp"),
        {"call_id": call_id},
    )
    return rows_to_dicts(result)


@router.post("", status_code=201)
async def create_call_event(body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    for field in ("call_id", "type", "timestamp"):
        if field not in body:
            raise HTTPException(status_code=422, detail=f"Missing field: {field}")
    result = await db.execute(
        text(
            "INSERT INTO call_events (call_id, type, message, timestamp) "
            "VALUES (:call_id, :type, :message, :timestamp)"
        ),
        {
            "call_id": body["call_id"],
            "type": body["type"],
            "message": body.get("message"),
            "timestamp": body["timestamp"],
        },
    )
    await db.commit()
    row = await db.execute(text("SELECT * FROM call_events WHERE id = :id"), {"id": result.lastrowid})
    return row_to_dict(row.first())
