from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.audit import write_audit_event
from common.db import get_db
from common.serialize import row_to_dict, rows_to_dicts

router = APIRouter(prefix="/patients", tags=["patients"])

_UPDATABLE_FIELDS = {
    "first_name", "last_name", "date_of_birth", "member_id",
    "group_number", "policy_number", "subscriber_name", "relationship",
}


@router.get("")
async def list_patients(member_id: str | None = None, db: AsyncSession = Depends(get_db)) -> list[dict]:
    query = "SELECT * FROM patients"
    params = {}
    if member_id is not None:
        query += " WHERE member_id = :member_id"
        params["member_id"] = member_id
    query += " ORDER BY last_name"
    result = await db.execute(text(query), params)
    return rows_to_dicts(result)


@router.get("/{patient_id}")
async def get_patient(patient_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(text("SELECT * FROM patients WHERE id = :id"), {"id": patient_id})
    patient = row_to_dict(result.first())
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.post("", status_code=201)
async def create_patient(body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    for field in ("first_name", "last_name", "date_of_birth", "member_id"):
        if field not in body:
            raise HTTPException(status_code=422, detail=f"Missing field: {field}")
    result = await db.execute(
        text(
            """
            INSERT INTO patients
                (first_name, last_name, date_of_birth, member_id, group_number,
                 policy_number, subscriber_name, relationship)
            VALUES
                (:first_name, :last_name, :date_of_birth, :member_id, :group_number,
                 :policy_number, :subscriber_name, :relationship)
            """
        ),
        {field: body.get(field) for field in _UPDATABLE_FIELDS},
    )
    await write_audit_event(db, action="create", resource_type="patient", resource_id=str(result.lastrowid))
    await db.commit()
    return await get_patient(result.lastrowid, db)


@router.patch("/{patient_id}")
async def update_patient(patient_id: int, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM patients WHERE id = :id"), {"id": patient_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    updates = {k: v for k, v in body.items() if k in _UPDATABLE_FIELDS}
    if not updates:
        return await get_patient(patient_id, db)
    set_clause = ", ".join(f"{field} = :{field}" for field in updates)
    updates["id"] = patient_id
    await db.execute(text(f"UPDATE patients SET {set_clause} WHERE id = :id"), updates)
    await write_audit_event(db, action="update", resource_type="patient", resource_id=str(patient_id))
    await db.commit()
    return await get_patient(patient_id, db)


@router.delete("/{patient_id}")
async def delete_patient(patient_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM patients WHERE id = :id"), {"id": patient_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    await db.execute(text("DELETE FROM patients WHERE id = :id"), {"id": patient_id})
    await write_audit_event(db, action="delete", resource_type="patient", resource_id=str(patient_id))
    await db.commit()
    return {"success": True}
