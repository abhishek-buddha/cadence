from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.audit import write_audit_event
from common.db import get_db
from common.serialize import from_json, row_to_dict, rows_to_dicts, to_json

from ..constants import VALID_CALL_CONNECTION_TYPES, VALID_PAYER_KINDS

router = APIRouter(prefix="/insurance-contacts", tags=["insurance-contacts"])

_JSON_FIELDS = {"ivr_steps", "voice_ivr_phrases"}
# Editing any of these invalidates a prior ivr_verified_at confirmation,
# ported from convex/insuranceContacts.ts.
_IVR_PLAYBOOK_FIELDS = {"ivr_instructions", "ivr_steps", "voice_ivr_phrases"}
_UPDATABLE_FIELDS = {
    "name", "phone", "department", "payer_id", "hours", "notes", "avg_hold_time",
    "payer_kind", "call_connection_type", "ivr_enabled", "ivr_instructions",
    "ivr_sequence", "ivr_steps", "voice_ivr_enabled", "voice_ivr_phrases",
    "ivr_source_transcript", "verification_requirements", "voice_tone",
    "voice_modulation", "human_agent_number", "warm_transfer_number",
}


def _decode(contact: dict) -> dict:
    contact["ivr_steps"] = from_json(contact["ivr_steps"])
    contact["voice_ivr_phrases"] = from_json(contact["voice_ivr_phrases"])
    return contact


def _validate_payer_kind(payer_kind: str | None) -> None:
    if payer_kind is not None and payer_kind not in VALID_PAYER_KINDS:
        raise HTTPException(status_code=422, detail=f"payer_kind must be one of {VALID_PAYER_KINDS}")


def _validate_call_connection_type(call_connection_type: str | None) -> None:
    if call_connection_type is not None and call_connection_type not in VALID_CALL_CONNECTION_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"call_connection_type must be one of {VALID_CALL_CONNECTION_TYPES}",
        )


@router.get("")
async def list_insurance_contacts(
    payer_kind: str | None = None, db: AsyncSession = Depends(get_db)
) -> list[dict]:
    query = "SELECT * FROM insurance_contacts"
    params = {}
    if payer_kind is not None:
        query += " WHERE payer_kind = :payer_kind"
        params["payer_kind"] = payer_kind
    query += " ORDER BY name"
    result = await db.execute(text(query), params)
    return [_decode(r) for r in rows_to_dicts(result)]


@router.get("/{contact_id}")
async def get_insurance_contact(contact_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(text("SELECT * FROM insurance_contacts WHERE id = :id"), {"id": contact_id})
    contact = row_to_dict(result.first())
    if contact is None:
        raise HTTPException(status_code=404, detail="Insurance contact not found")
    return _decode(contact)


@router.post("", status_code=201)
async def create_insurance_contact(body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    for field in ("name", "phone"):
        if field not in body:
            raise HTTPException(status_code=422, detail=f"Missing field: {field}")
    _validate_payer_kind(body.get("payer_kind"))
    _validate_call_connection_type(body.get("call_connection_type"))

    columns = sorted(_UPDATABLE_FIELDS)
    params = {f: (to_json(body.get(f)) if f in _JSON_FIELDS else body.get(f)) for f in columns}
    result = await db.execute(
        text(
            f"INSERT INTO insurance_contacts ({', '.join(columns)}) "
            f"VALUES ({', '.join(':' + c for c in columns)})"
        ),
        params,
    )
    await write_audit_event(
        db, action="create", resource_type="insurance_contact", resource_id=str(result.lastrowid)
    )
    await db.commit()
    return await get_insurance_contact(result.lastrowid, db)


@router.patch("/{contact_id}")
async def update_insurance_contact(contact_id: int, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM insurance_contacts WHERE id = :id"), {"id": contact_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="Insurance contact not found")

    clear_ivr_verified_at = bool(body.get("clear_ivr_verified_at"))
    updates = {k: v for k, v in body.items() if k in _UPDATABLE_FIELDS}
    if "payer_kind" in updates:
        _validate_payer_kind(updates["payer_kind"])
    if "call_connection_type" in updates:
        _validate_call_connection_type(updates["call_connection_type"])

    if updates:
        set_clause = ", ".join(f"{field} = :{field}" for field in updates)
        params = {k: (to_json(v) if k in _JSON_FIELDS else v) for k, v in updates.items()}
        if clear_ivr_verified_at or _IVR_PLAYBOOK_FIELDS & updates.keys():
            set_clause += ", ivr_verified_at = NULL"
        params["id"] = contact_id
        await db.execute(text(f"UPDATE insurance_contacts SET {set_clause} WHERE id = :id"), params)
    elif clear_ivr_verified_at:
        await db.execute(
            text("UPDATE insurance_contacts SET ivr_verified_at = NULL WHERE id = :id"), {"id": contact_id}
        )

    await write_audit_event(
        db, action="update", resource_type="insurance_contact", resource_id=str(contact_id)
    )
    await db.commit()
    return await get_insurance_contact(contact_id, db)


@router.delete("/{contact_id}")
async def delete_insurance_contact(contact_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM insurance_contacts WHERE id = :id"), {"id": contact_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="Insurance contact not found")
    await db.execute(text("DELETE FROM insurance_contacts WHERE id = :id"), {"id": contact_id})
    await write_audit_event(
        db, action="delete", resource_type="insurance_contact", resource_id=str(contact_id)
    )
    await db.commit()
    return {"success": True}
