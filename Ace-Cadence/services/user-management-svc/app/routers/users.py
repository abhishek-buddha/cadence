from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.audit import write_audit_event
from common.db import get_db
from common.serialize import from_json, row_to_dict, rows_to_dicts, to_json

from ..constants import VALID_ROLES, VALID_SPECIALIZATIONS, VALID_USER_STATUSES

router = APIRouter(prefix="/users", tags=["users"])


def _decode(user: dict) -> dict:
    user["insurance_contact_ids"] = from_json(user["insurance_contact_ids"])
    user["provider_ids"] = from_json(user["provider_ids"])
    user["specializations"] = from_json(user["specializations"])
    return user


def _validate_role(role: str) -> None:
    if role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {VALID_ROLES}")


def _validate_status(status: str) -> None:
    if status not in VALID_USER_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {VALID_USER_STATUSES}")


def _validate_specializations(specializations: list | None) -> None:
    if specializations is None:
        return
    invalid = [s for s in specializations if s not in VALID_SPECIALIZATIONS]
    if invalid:
        raise HTTPException(status_code=422, detail=f"invalid specializations: {invalid}")


@router.get("")
async def list_users(role: str | None = None, db: AsyncSession = Depends(get_db)) -> list[dict]:
    query = "SELECT * FROM users"
    params = {}
    if role is not None:
        query += " WHERE role = :role"
        params["role"] = role
    query += " ORDER BY name"
    result = await db.execute(text(query), params)
    return [_decode(r) for r in rows_to_dicts(result)]


@router.get("/{user_id}")
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(text("SELECT * FROM users WHERE id = :id"), {"id": user_id})
    user = row_to_dict(result.first())
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _decode(user)


@router.post("", status_code=201)
async def create_user(body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    for field in ("email", "role"):
        if field not in body:
            raise HTTPException(status_code=422, detail=f"Missing field: {field}")
    _validate_role(body["role"])
    status = body.get("status", "active")
    _validate_status(status)
    _validate_specializations(body.get("specializations"))

    existing = await db.execute(text("SELECT id FROM users WHERE email = :email"), {"email": body["email"]})
    if existing.first() is not None:
        raise HTTPException(status_code=409, detail="Email already in use")

    result = await db.execute(
        text(
            """
            INSERT INTO users
                (email, name, role, status, insurance_contact_ids, provider_ids,
                 specializations, team_lead_name, user_group_id)
            VALUES
                (:email, :name, :role, :status, :insurance_contact_ids, :provider_ids,
                 :specializations, :team_lead_name, :user_group_id)
            """
        ),
        {
            "email": body["email"],
            "name": body.get("name"),
            "role": body["role"],
            "status": status,
            "insurance_contact_ids": to_json(body.get("insurance_contact_ids")),
            "provider_ids": to_json(body.get("provider_ids")),
            "specializations": to_json(body.get("specializations")),
            "team_lead_name": body.get("team_lead_name"),
            "user_group_id": body.get("user_group_id"),
        },
    )
    await write_audit_event(db, action="create", resource_type="user", resource_id=str(result.lastrowid))
    await db.commit()
    return await get_user(result.lastrowid, db)


_UPDATABLE_FIELDS = {
    "email", "name", "role", "status", "insurance_contact_ids", "provider_ids",
    "specializations", "team_lead_name", "user_group_id",
}
_JSON_FIELDS = {"insurance_contact_ids", "provider_ids", "specializations"}


@router.patch("/{user_id}")
async def update_user(user_id: int, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM users WHERE id = :id"), {"id": user_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="User not found")

    updates = {k: v for k, v in body.items() if k in _UPDATABLE_FIELDS}
    if "role" in updates:
        _validate_role(updates["role"])
    if "status" in updates:
        _validate_status(updates["status"])
    if "specializations" in updates:
        _validate_specializations(updates["specializations"])
    if not updates:
        return await get_user(user_id, db)

    set_clause = ", ".join(f"{field} = :{field}" for field in updates)
    params = {k: (to_json(v) if k in _JSON_FIELDS else v) for k, v in updates.items()}
    params["id"] = user_id
    await db.execute(text(f"UPDATE users SET {set_clause} WHERE id = :id"), params)
    await write_audit_event(db, action="update", resource_type="user", resource_id=str(user_id))
    await db.commit()
    return await get_user(user_id, db)


@router.delete("/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM users WHERE id = :id"), {"id": user_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="User not found")
    await db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
    await write_audit_event(db, action="delete", resource_type="user", resource_id=str(user_id))
    await db.commit()
    return {"success": True}
