from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from common.audit import write_audit_event
from common.db import get_db
from common.serialize import row_to_dict, rows_to_dicts

from ..constants import validate_job_status, validate_job_type

router = APIRouter(prefix="/jobs", tags=["jobs"])

_UPDATABLE_FIELDS = {"status", "triggered_at", "error_message"}


@router.get("")
async def list_jobs(
    status: str | None = None,
    due: bool = False,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """`due=true` is what this service's own poll loop calls to find jobs
    ready to trigger — status='pending' and scheduled_for in the past."""
    if due:
        result = await db.execute(
            text(
                "SELECT * FROM scheduled_call_jobs WHERE status = 'pending' "
                "AND scheduled_for <= :now ORDER BY scheduled_for"
            ),
            {"now": datetime.now(timezone.utc)},
        )
        return rows_to_dicts(result)

    query = "SELECT * FROM scheduled_call_jobs"
    params = {}
    if status is not None:
        query += " WHERE status = :status"
        params["status"] = status
    query += " ORDER BY scheduled_for"
    result = await db.execute(text(query), params)
    return rows_to_dicts(result)


@router.get("/{job_id}")
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(text("SELECT * FROM scheduled_call_jobs WHERE id = :id"), {"id": job_id})
    job = row_to_dict(result.first())
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("", status_code=201)
async def create_job(body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    """The UNIQUE(job_type, ref_id, scheduled_for) constraint (created on
    the table itself) is the actual dedup mechanism — this just surfaces a
    clean 409 instead of a raw DB integrity error when a duplicate slips
    through."""
    for field in ("job_type", "ref_id", "scheduled_for"):
        if field not in body:
            raise HTTPException(status_code=422, detail=f"Missing field: {field}")
    try:
        validate_job_type(body["job_type"])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        result = await db.execute(
            text(
                "INSERT INTO scheduled_call_jobs (job_type, ref_id, scheduled_for, status) "
                "VALUES (:job_type, :ref_id, :scheduled_for, 'pending')"
            ),
            {
                "job_type": body["job_type"],
                "ref_id": body["ref_id"],
                "scheduled_for": body["scheduled_for"],
            },
        )
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Job already scheduled") from exc

    await write_audit_event(
        db, action="create", resource_type="scheduled_call_job", resource_id=str(result.lastrowid)
    )
    await db.commit()
    return await get_job(result.lastrowid, db)


@router.patch("/{job_id}")
async def update_job(job_id: int, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(text("SELECT id FROM scheduled_call_jobs WHERE id = :id"), {"id": job_id})
    if existing.first() is None:
        raise HTTPException(status_code=404, detail="Job not found")

    updates = {k: v for k, v in body.items() if k in _UPDATABLE_FIELDS}
    if "status" in updates:
        try:
            validate_job_status(updates["status"])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not updates:
        return await get_job(job_id, db)

    set_clause = ", ".join(f"{field} = :{field}" for field in updates)
    updates["id"] = job_id
    await db.execute(text(f"UPDATE scheduled_call_jobs SET {set_clause} WHERE id = :id"), updates)
    await write_audit_event(
        db, action="update", resource_type="scheduled_call_job", resource_id=str(job_id)
    )
    await db.commit()
    return await get_job(job_id, db)
