from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter

from ..client import fetch_call_results, fetch_calls, fetch_claims, fetch_insurance_contacts

router = APIRouter(prefix="/reports", tags=["reports"])


def _has_value(value) -> bool:
    return value not in (None, "", [], {})


def _completed(call: dict) -> bool:
    return call.get("status") == "completed" or _has_value(call.get("completed_at"))


def _successful_call_ids(calls: list[dict], results: list[dict]) -> set[int]:
    result_call_ids = {r["call_id"] for r in results if r.get("call_id") is not None}
    return {
        c["id"] for c in calls
        if c.get("outcome") == "successful" or c.get("id") in result_call_ids
    }


def _week_start(value: str | None) -> str | None:
    if not value:
        return None
    date = datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    return (date - timedelta(days=date.weekday())).isoformat()


@router.get("/call-analytics")
async def call_analytics(use_case: str | None = None) -> dict:
    calls = await fetch_calls(use_case)
    by_status: dict[str, int] = defaultdict(int)
    for call in calls:
        by_status[call["status"]] += 1
    return {"total_calls": len(calls), "by_status": dict(by_status)}


@router.get("/success-rate")
async def success_rate(use_case: str | None = None) -> dict:
    calls = await fetch_calls(use_case)
    results = await fetch_call_results()
    completed = [c for c in calls if _completed(c)]
    successful = _successful_call_ids(completed, results)
    failed = [c for c in calls if c.get("status") == "failed" or c.get("outcome") == "failed"]
    transferred = [c for c in calls if c.get("outcome") == "transferred_to_human" or _has_value(c.get("human_transcript"))]
    partial = [c for c in completed if c["id"] not in successful and c not in failed and c not in transferred]
    rate = (len(successful) / len(completed) * 100) if completed else 0.0
    return {
        "total": len(calls),
        "total_completed": len(completed),
        "successful": len(successful),
        "partial": len(partial),
        "failed": len(failed),
        "transferred": len(transferred),
        "success_rate_pct": round(rate, 1),
    }


@router.get("/success-rate-by-payer")
async def success_rate_by_payer(use_case: str | None = None) -> list[dict]:
    calls = await fetch_calls(use_case)
    results = await fetch_call_results()
    contacts = await fetch_insurance_contacts()
    names = {c["id"]: c["name"] for c in contacts}
    successful = _successful_call_ids(calls, results)
    buckets: dict[int, dict] = defaultdict(lambda: {"successful": 0, "partial": 0, "failed": 0, "total": 0})
    for call in calls:
        payer_id = call.get("insurance_contact_id")
        if payer_id is None:
            continue
        bucket = buckets[payer_id]
        bucket["total"] += 1
        if call.get("id") in successful:
            bucket["successful"] += 1
        elif call.get("status") == "failed" or call.get("outcome") == "failed":
            bucket["failed"] += 1
        else:
            bucket["partial"] += 1
    return [
        {
            "payer": payer_id,
            "payer_name": names.get(payer_id, "Unknown"),
            **bucket,
            "pct": round(bucket["successful"] / bucket["total"] * 100, 1) if bucket["total"] else 0,
        }
        for payer_id, bucket in sorted(buckets.items(), key=lambda item: item[1]["total"], reverse=True)
    ]


@router.get("/success-rate-by-week")
async def success_rate_by_week(use_case: str | None = None) -> list[dict]:
    calls = await fetch_calls(use_case)
    results = await fetch_call_results()
    successful = _successful_call_ids(calls, results)
    buckets: dict[str, dict] = defaultdict(lambda: {"successful": 0, "partial": 0, "failed": 0, "total": 0})
    for call in calls:
        week = _week_start(call.get("started_at"))
        if week is None:
            continue
        bucket = buckets[week]
        bucket["total"] += 1
        if call.get("id") in successful:
            bucket["successful"] += 1
        elif call.get("status") == "failed" or call.get("outcome") == "failed":
            bucket["failed"] += 1
        else:
            bucket["partial"] += 1
    return [{"week_start": week, **bucket} for week, bucket in sorted(buckets.items())]


@router.get("/data-accuracy")
async def data_accuracy(use_case: str | None = None) -> dict:
    calls = await fetch_calls(use_case)
    call_ids = {c["id"] for c in calls}
    results = [r for r in await fetch_call_results() if r.get("call_id") in call_ids]
    fields = [
        ("claim_status", "Claim status"),
        ("paid_amount", "Paid amount"),
        ("reference_number", "Reference number"),
        ("rep_name", "Rep name"),
        ("denial_reason", "Denial reason"),
        ("expected_decision_date", "Expected decision date"),
    ]
    by_field = []
    for key, label in fields:
        captured = [r for r in results if _has_value(r.get(key))]
        confidences = [r["confidence"] for r in captured if isinstance(r.get("confidence"), (int, float))]
        by_field.append({
            "field": label,
            "total_calls": len(results),
            "captured_count": len(captured),
            "capture_rate": len(captured) / len(results) if results else 0,
            "avg_confidence": sum(confidences) / len(confidences) if confidences else None,
        })
    complete_results = [
        r for r in results
        if _has_value(r.get("claim_status")) and _has_value(r.get("reference_number")) and _has_value(r.get("next_steps"))
    ]
    confidences = [r["confidence"] for r in results if isinstance(r.get("confidence"), (int, float))]
    return {
        "total_completed": len(results),
        "fully_retrieved": len(complete_results),
        "accuracy_pct": round(len(complete_results) / len(results) * 100, 1) if results else 0.0,
        "overall": {
            "capture_rate": sum(f["capture_rate"] for f in by_field) / len(by_field) if by_field else 0,
            "avg_confidence": sum(confidences) / len(confidences) if confidences else None,
        },
        "by_field": by_field,
    }


@router.get("/turnaround-time")
async def turnaround_time(use_case: str | None = None) -> dict:
    durations = [c["duration"] for c in await fetch_calls(use_case) if c.get("duration") is not None]
    avg = sum(durations) / len(durations) if durations else 0.0
    return {"sample_size": len(durations), "avg_call_duration_seconds": round(avg, 1)}


@router.get("/hold-metrics")
async def hold_metrics(use_case: str | None = None) -> dict:
    holds = [c["hold_duration"] for c in await fetch_calls(use_case) if c.get("hold_duration") is not None]
    avg = sum(holds) / len(holds) if holds else 0.0
    return {"sample_size": len(holds), "avg_hold_seconds": round(avg, 1), "max_hold_seconds": max(holds, default=0)}


@router.get("/operational-kpis")
async def operational_kpis(use_case: str | None = None) -> dict:
    calls = await fetch_calls(use_case)
    completed = [c for c in calls if _completed(c)]
    transferred = [c for c in calls if c.get("outcome") == "transferred_to_human" or _has_value(c.get("human_transcript"))]
    failed = [c for c in calls if c["status"] == "failed"]
    total_duration = sum(c.get("duration") or 0 for c in completed)
    return {
        "total_calls": len(calls),
        "completed_calls": len(completed),
        "transferred_to_human": len(transferred),
        "failed_calls": len(failed),
        "estimated_minutes_saved": round(total_duration / 60),
        "estimated_cost_savings": round((total_duration / 3600) * 28),
    }


@router.get("/exceptions")
async def exception_report(use_case: str | None = None) -> dict:
    calls = await fetch_calls(use_case)
    exceptions = [
        c for c in calls
        if c["status"] == "failed" or c.get("outcome") == "failed" or c.get("error_message")
    ]
    return {"total_exceptions": len(exceptions), "calls": exceptions}


@router.get("/volume-by-tier")
async def volume_by_tier(use_case: str | None = None) -> dict:
    claims = await fetch_claims(use_case)
    by_priority: dict[str, int] = defaultdict(int)
    for claim in claims:
        by_priority[claim["priority"]] += 1
    return {"total_claims": len(claims), "by_priority": dict(by_priority)}
