from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.audit import write_audit_event
from common.db import get_db
from common.serialize import from_json, row_to_dict, rows_to_dicts, to_json

from ..constants import validate_session_item_refs, validate_session_status, validate_use_case

router = APIRouter(prefix="/call-sessions", tags=["call-sessions"])

_UPDATABLE_FIELDS = {"status", "aggregate_outcome", "notes", "started_at", "completed_at"}


def _decode(session: dict) -> dict:
    session["item_refs"] = from_json(session["item_refs"])
    return session


def _raise_422(exc: ValueError) -> None:
    raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("")
async def list_call_sessions(status: str | None = None, db: AsyncSession = Depends(get_db)) -> list[dict]:
    query = "SELECT * FROM call_sessions"
    params = {}
    if status is not None:
        query += " WHERE status = :status"
        params["status"] = status
    query += " ORDER BY created_at DESC"
    result = await db.execute(text(query), params)
    return [_decode(r) for r in rows_to_dicts(result)]


@router.get("/{session_id}")
async def get_call_session(session_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(text("SELECT * FROM call_sessions WHERE id = :id"), {"id": session_id})
    session = row_to_dict(result.first())
    if session is None:
        raise HTTPException(status_code=404, detail="Call session not found")
    return _decode(session)


@router.post("", status_code=201)
async def create_call_session(body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    for field in ("insurance_contact_id", "use_case", "item_refs"):
        if field not in body:
            raise HTTPException(status_code=422, detail=f"Missing field: {field}")
    try:
        validate_use_case(body["use_case"])
        validate_session_item_refs(body["item_refs"])
    except ValueError as exc:
        _raise_422(exc)

    result = await db.execute(
        text(
            """
            INSERT INTO call_sessions (insurance_contact_id, use_case, item_refs, status, notes)
            VALUES (:insurance_contact_id, :use_case, :item_refs, 'queued', :notes)
            """
        ),
        {
            "insurance_contact_id": body["insurance_contact_id"],
            "use_case": body["use_case"],
            "item_refs": to_json(body["item_refs"]),
            "notes": body.get("notes"),
        },
    )
    await write_audit_event(
        db, action="create", resource_type="call_session", resource_id=str(result.lastrowid)
    )
    await db.commit()
    return await get_call_session(result.lastrowid, db)


@router.patch("/{session_id}")
async def update_call_session(session_id: int, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM call_sessions WHERE id = :id"), {"id": session_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="Call session not found")

    updates = {k: v for k, v in body.items() if k in _UPDATABLE_FIELDS}
    if "status" in updates:
        try:
            validate_session_status(updates["status"])
        except ValueError as exc:
            _raise_422(exc)
    if not updates:
        return await get_call_session(session_id, db)

    set_clause = ", ".join(f"{field} = :{field}" for field in updates)
    updates["id"] = session_id
    await db.execute(text(f"UPDATE call_sessions SET {set_clause} WHERE id = :id"), updates)
    await write_audit_event(db, action="update", resource_type="call_session", resource_id=str(session_id))
    await db.commit()
    return await get_call_session(session_id, db)


@router.delete("/{session_id}")
async def delete_call_session(session_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM call_sessions WHERE id = :id"), {"id": session_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="Call session not found")
    await db.execute(text("DELETE FROM call_sessions WHERE id = :id"), {"id": session_id})
    await write_audit_event(db, action="delete", resource_type="call_session", resource_id=str(session_id))
    await db.commit()
    return {"success": True}
