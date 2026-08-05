from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.db import get_db
from common.serialize import row_to_dict

router = APIRouter(prefix="/call-settings", tags=["call-settings"])


@router.get("/{key}")
async def get_call_setting(key: str, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(text("SELECT * FROM call_settings WHERE `key` = :key"), {"key": key})
    setting = row_to_dict(result.first())
    if setting is None:
        raise HTTPException(status_code=404, detail="Setting not found")
    return setting


@router.put("/{key}")
async def upsert_call_setting(key: str, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    """Passes state between call-placement steps mid-call (e.g. session
    progress) — deliberately unaudited, high-frequency scratch storage."""
    if "value" not in body:
        raise HTTPException(status_code=422, detail="Missing field: value")
    await db.execute(
        text(
            "INSERT INTO call_settings (`key`, value) VALUES (:key, :value) "
            "ON DUPLICATE KEY UPDATE value = :value"
        ),
        {"key": key, "value": body["value"]},
    )
    await db.commit()
    result = await db.execute(text("SELECT * FROM call_settings WHERE `key` = :key"), {"key": key})
    return row_to_dict(result.first())


@router.delete("/{key}")
async def delete_call_setting(key: str, db: AsyncSession = Depends(get_db)) -> dict:
    await db.execute(text("DELETE FROM call_settings WHERE `key` = :key"), {"key": key})
    await db.commit()
    return {"success": True}
