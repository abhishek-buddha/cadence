from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.audit import write_audit_event
from common.db import get_db
from common.serialize import from_json, row_to_dict, rows_to_dicts, to_json

from ..constants import VALID_SPECIALIZATIONS

router = APIRouter(prefix="/user-groups", tags=["user-groups"])


def _decode(group: dict) -> dict:
    group["insurance_contact_ids"] = from_json(group["insurance_contact_ids"])
    group["provider_ids"] = from_json(group["provider_ids"])
    group["specializations"] = from_json(group["specializations"])
    return group


def _validate_specializations(specializations: list | None) -> None:
    if specializations is None:
        return
    invalid = [s for s in specializations if s not in VALID_SPECIALIZATIONS]
    if invalid:
        raise HTTPException(status_code=422, detail=f"invalid specializations: {invalid}")


@router.get("")
async def list_user_groups(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(text("SELECT * FROM user_groups ORDER BY name"))
    return [_decode(r) for r in rows_to_dicts(result)]


@router.get("/{group_id}")
async def get_user_group(group_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(text("SELECT * FROM user_groups WHERE id = :id"), {"id": group_id})
    group = row_to_dict(result.first())
    if group is None:
        raise HTTPException(status_code=404, detail="User group not found")
    return _decode(group)


@router.post("", status_code=201)
async def create_user_group(body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    if "name" not in body:
        raise HTTPException(status_code=422, detail="Missing field: name")
    _validate_specializations(body.get("specializations"))

    result = await db.execute(
        text(
            """
            INSERT INTO user_groups (name, insurance_contact_ids, provider_ids, specializations)
            VALUES (:name, :insurance_contact_ids, :provider_ids, :specializations)
            """
        ),
        {
            "name": body["name"],
            "insurance_contact_ids": to_json(body.get("insurance_contact_ids")),
            "provider_ids": to_json(body.get("provider_ids")),
            "specializations": to_json(body.get("specializations")),
        },
    )
    await write_audit_event(db, action="create", resource_type="user_group", resource_id=str(result.lastrowid))
    await db.commit()
    return await get_user_group(result.lastrowid, db)


_UPDATABLE_FIELDS = {"name", "insurance_contact_ids", "provider_ids", "specializations"}
_JSON_FIELDS = {"insurance_contact_ids", "provider_ids", "specializations"}


@router.patch("/{group_id}")
async def update_user_group(group_id: int, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM user_groups WHERE id = :id"), {"id": group_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="User group not found")

    updates = {k: v for k, v in body.items() if k in _UPDATABLE_FIELDS}
    if "specializations" in updates:
        _validate_specializations(updates["specializations"])
    if not updates:
        return await get_user_group(group_id, db)

    set_clause = ", ".join(f"{field} = :{field}" for field in updates)
    params = {k: (to_json(v) if k in _JSON_FIELDS else v) for k, v in updates.items()}
    params["id"] = group_id
    await db.execute(text(f"UPDATE user_groups SET {set_clause} WHERE id = :id"), params)
    await write_audit_event(db, action="update", resource_type="user_group", resource_id=str(group_id))
    await db.commit()
    return await get_user_group(group_id, db)


@router.delete("/{group_id}")
async def delete_user_group(group_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM user_groups WHERE id = :id"), {"id": group_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="User group not found")
    await db.execute(text("DELETE FROM user_groups WHERE id = :id"), {"id": group_id})
    await write_audit_event(db, action="delete", resource_type="user_group", resource_id=str(group_id))
    await db.commit()
    return {"success": True}
