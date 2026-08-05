from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.audit import write_audit_event
from common.db import get_db
from common.serialize import from_json, row_to_dict, rows_to_dicts, to_json

from ..constants import validate_use_case

router = APIRouter(prefix="/call-results", tags=["call-results"])

_JSON_FIELDS = {"frequency_limits", "waiting_periods"}
_CREATE_FIELDS = {
    "call_id", "claim_id", "use_case", "claim_status", "paid_amount", "paid_date",
    "check_or_eft_number", "denial_code", "remark_code", "denial_reason", "appeal_deadline",
    "missing_documents", "expected_decision_date", "is_active", "coverage_effective_date",
    "coverage_termination_date", "deductible_annual_cents", "deductible_met_cents",
    "coinsurance_pct", "copay_cents", "annual_maximum_cents", "annual_max_remaining_cents",
    "network_status", "frequency_limits", "waiting_periods", "reference_number", "rep_name",
    "next_steps", "raw_extraction", "confidence",
}


def _decode(call_result: dict) -> dict:
    for field in _JSON_FIELDS:
        call_result[field] = from_json(call_result[field])
    return call_result


@router.get("")
async def list_call_results(
    claim_id: int | None = None,
    call_id: int | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    clauses, params = [], {}
    if claim_id is not None:
        clauses.append("claim_id = :claim_id")
        params["claim_id"] = claim_id
    if call_id is not None:
        clauses.append("call_id = :call_id")
        params["call_id"] = call_id
    query = "SELECT * FROM call_results"
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY created_at DESC"
    result = await db.execute(text(query), params)
    return [_decode(r) for r in rows_to_dicts(result)]


@router.get("/{result_id}")
async def get_call_result(result_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(text("SELECT * FROM call_results WHERE id = :id"), {"id": result_id})
    call_result = row_to_dict(result.first())
    if call_result is None:
        raise HTTPException(status_code=404, detail="Call result not found")
    return _decode(call_result)


@router.post("", status_code=201)
async def create_call_result(body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    for field in ("call_id", "claim_id", "use_case", "raw_extraction"):
        if field not in body:
            raise HTTPException(status_code=422, detail=f"Missing field: {field}")
    try:
        validate_use_case(body["use_case"])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    columns = sorted(_CREATE_FIELDS)
    params = {f: (to_json(body.get(f)) if f in _JSON_FIELDS else body.get(f)) for f in columns}
    result = await db.execute(
        text(
            f"INSERT INTO call_results ({', '.join(columns)}) "
            f"VALUES ({', '.join(':' + c for c in columns)})"
        ),
        params,
    )
    await write_audit_event(
        db, action="create", resource_type="call_result", resource_id=str(result.lastrowid)
    )
    await db.commit()
    return await get_call_result(result.lastrowid, db)
