from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.audit import write_audit_event
from common.db import get_db
from common.serialize import from_json, row_to_dict, rows_to_dicts, to_json

from ..constants import (
    validate_followup_disposition,
    validate_initial_claim_status,
    validate_priority,
    validate_status_transition,
    validate_use_case,
)

router = APIRouter(prefix="/claims", tags=["claims"])

_JSON_FIELDS = {"cpt_codes", "diagnosis_codes", "cdt_codes"}
_CREATE_FIELDS = {
    "use_case", "claim_number", "patient_id", "insurance_contact_id", "provider_id",
    "date_of_service", "status", "priority", "notes", "amount", "date_submitted",
    "cpt_codes", "diagnosis_codes", "aging_bucket", "denial_code", "denial_reason",
    "remark_code", "appeal_deadline", "reference_number", "cdt_codes",
}
_UPDATABLE_FIELDS = _CREATE_FIELDS - {"use_case", "claim_number", "patient_id", "status"}
_FOLLOWUP_FIELDS = {
    "last_called_at", "next_follow_up_date", "follow_up_disposition",
    "follow_up_comment", "follow_up_by", "follow_up_at",
}


def _decode(claim: dict) -> dict:
    for field in _JSON_FIELDS:
        claim[field] = from_json(claim[field])
    return claim


def _raise_422(exc: ValueError) -> None:
    raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("")
async def list_claims(
    use_case: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    patient_id: int | None = None,
    insurance_contact_id: int | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    clauses, params = [], {}
    for field, value in (
        ("use_case", use_case), ("status", status), ("priority", priority),
        ("patient_id", patient_id), ("insurance_contact_id", insurance_contact_id),
    ):
        if value is not None:
            clauses.append(f"{field} = :{field}")
            params[field] = value
    query = "SELECT * FROM claims"
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY created_at DESC"
    result = await db.execute(text(query), params)
    return [_decode(r) for r in rows_to_dicts(result)]


@router.get("/{claim_id}")
async def get_claim(claim_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(text("SELECT * FROM claims WHERE id = :id"), {"id": claim_id})
    claim = row_to_dict(result.first())
    if claim is None:
        raise HTTPException(status_code=404, detail="Claim not found")
    return _decode(claim)


@router.post("", status_code=201)
async def create_claim(body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    for field in ("use_case", "claim_number", "patient_id", "insurance_contact_id", "provider_id",
                  "date_of_service", "status"):
        if field not in body:
            raise HTTPException(status_code=422, detail=f"Missing field: {field}")
    try:
        validate_use_case(body["use_case"])
        validate_initial_claim_status(body["use_case"], body["status"])
        validate_priority(body.get("priority", "medium"))
    except ValueError as exc:
        _raise_422(exc)

    columns = sorted(_CREATE_FIELDS)
    params = {f: (to_json(body.get(f)) if f in _JSON_FIELDS else body.get(f)) for f in columns}
    params["priority"] = params.get("priority") or "medium"
    result = await db.execute(
        text(
            f"INSERT INTO claims ({', '.join(columns)}) VALUES ({', '.join(':' + c for c in columns)})"
        ),
        params,
    )
    claim_id = result.lastrowid
    await db.execute(text("INSERT INTO claim_followups (claim_id) VALUES (:claim_id)"), {"claim_id": claim_id})
    await write_audit_event(db, action="create", resource_type="claim", resource_id=str(claim_id))
    await db.commit()
    return await get_claim(claim_id, db)


@router.patch("/{claim_id}")
async def update_claim(claim_id: int, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM claims WHERE id = :id"), {"id": claim_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="Claim not found")

    updates = {k: v for k, v in body.items() if k in _UPDATABLE_FIELDS}
    if "priority" in updates:
        try:
            validate_priority(updates["priority"])
        except ValueError as exc:
            _raise_422(exc)
    if not updates:
        return await get_claim(claim_id, db)

    set_clause = ", ".join(f"{field} = :{field}" for field in updates)
    params = {k: (to_json(v) if k in _JSON_FIELDS else v) for k, v in updates.items()}
    params["id"] = claim_id
    await db.execute(text(f"UPDATE claims SET {set_clause} WHERE id = :id"), params)
    await write_audit_event(db, action="update", resource_type="claim", resource_id=str(claim_id))
    await db.commit()
    return await get_claim(claim_id, db)


@router.patch("/{claim_id}/status")
async def update_claim_status(claim_id: int, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    """Enforces the same status-transition graph the architecture plan
    assigns to a MySQL BEFORE UPDATE trigger (branching on use_case) —
    checked here too so the API rejects an invalid move before it ever
    reaches the database."""
    if "status" not in body:
        raise HTTPException(status_code=422, detail="Missing field: status")
    result = await db.execute(text("SELECT use_case, status FROM claims WHERE id = :id"), {"id": claim_id})
    claim = result.first()
    if claim is None:
        raise HTTPException(status_code=404, detail="Claim not found")
    try:
        validate_status_transition(claim.use_case, claim.status, body["status"])
    except ValueError as exc:
        _raise_422(exc)

    await db.execute(
        text("UPDATE claims SET status = :status WHERE id = :id"), {"status": body["status"], "id": claim_id}
    )
    await write_audit_event(
        db, action="update", resource_type="claim", resource_id=str(claim_id),
        payload_summary=f"status -> {body['status']}",
    )
    await db.commit()
    return await get_claim(claim_id, db)


@router.get("/{claim_id}/followup")
async def get_claim_followup(claim_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(
        text("SELECT * FROM claim_followups WHERE claim_id = :claim_id"), {"claim_id": claim_id}
    )
    followup = row_to_dict(result.first())
    if followup is None:
        raise HTTPException(status_code=404, detail="Claim followup not found")
    return followup


@router.patch("/{claim_id}/followup")
async def update_claim_followup(claim_id: int, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(
        text("SELECT claim_id FROM claim_followups WHERE claim_id = :claim_id"), {"claim_id": claim_id}
    )
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="Claim followup not found")

    updates = {k: v for k, v in body.items() if k in _FOLLOWUP_FIELDS}
    if "follow_up_disposition" in updates:
        try:
            validate_followup_disposition(updates["follow_up_disposition"])
        except ValueError as exc:
            _raise_422(exc)
    if not updates:
        return await get_claim_followup(claim_id, db)

    set_clause = ", ".join(f"{field} = :{field}" for field in updates)
    updates["claim_id"] = claim_id
    await db.execute(text(f"UPDATE claim_followups SET {set_clause} WHERE claim_id = :claim_id"), updates)
    await write_audit_event(db, action="update", resource_type="claim_followup", resource_id=str(claim_id))
    await db.commit()
    return await get_claim_followup(claim_id, db)


@router.delete("/{claim_id}")
async def delete_claim(claim_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM claims WHERE id = :id"), {"id": claim_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="Claim not found")
    await db.execute(text("DELETE FROM claims WHERE id = :id"), {"id": claim_id})
    await write_audit_event(db, action="delete", resource_type="claim", resource_id=str(claim_id))
    await db.commit()
    return {"success": True}
