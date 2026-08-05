from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.audit import write_audit_event
from common.db import get_db
from common.serialize import row_to_dict, rows_to_dicts

router = APIRouter(prefix="/providers", tags=["providers"])

_UPDATABLE_FIELDS = {"practice_name", "npi", "tax_id", "address", "phone", "specialty"}


@router.get("")
async def list_providers(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(text("SELECT * FROM providers ORDER BY practice_name"))
    return rows_to_dicts(result)


@router.get("/{provider_id}")
async def get_provider(provider_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(text("SELECT * FROM providers WHERE id = :id"), {"id": provider_id})
    provider = row_to_dict(result.first())
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider


@router.post("", status_code=201)
async def create_provider(body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    for field in ("practice_name", "npi", "tax_id", "address", "phone"):
        if field not in body:
            raise HTTPException(status_code=422, detail=f"Missing field: {field}")
    result = await db.execute(
        text(
            """
            INSERT INTO providers (practice_name, npi, tax_id, address, phone, specialty)
            VALUES (:practice_name, :npi, :tax_id, :address, :phone, :specialty)
            """
        ),
        {field: body.get(field) for field in (*_UPDATABLE_FIELDS,)},
    )
    await write_audit_event(db, action="create", resource_type="provider", resource_id=str(result.lastrowid))
    await db.commit()
    return await get_provider(result.lastrowid, db)


@router.patch("/{provider_id}")
async def update_provider(provider_id: int, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM providers WHERE id = :id"), {"id": provider_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    updates = {k: v for k, v in body.items() if k in _UPDATABLE_FIELDS}
    if not updates:
        return await get_provider(provider_id, db)
    set_clause = ", ".join(f"{field} = :{field}" for field in updates)
    updates["id"] = provider_id
    await db.execute(text(f"UPDATE providers SET {set_clause} WHERE id = :id"), updates)
    await write_audit_event(db, action="update", resource_type="provider", resource_id=str(provider_id))
    await db.commit()
    return await get_provider(provider_id, db)


@router.delete("/{provider_id}")
async def delete_provider(provider_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM providers WHERE id = :id"), {"id": provider_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    await db.execute(text("DELETE FROM providers WHERE id = :id"), {"id": provider_id})
    await write_audit_event(db, action="delete", resource_type="provider", resource_id=str(provider_id))
    await db.commit()
    return {"success": True}
