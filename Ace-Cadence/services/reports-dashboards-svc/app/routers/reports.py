from collections import defaultdict

from fastapi import APIRouter

from ..client import fetch_calls, fetch_claims

router = APIRouter(prefix="/reports", tags=["reports"])

# The 8 report tabs from the current app's ReportsPage — each endpoint here
# corresponds 1:1 to one tab. Aggregation is done in-memory over
# call-handling-svc's data (acceptable at this app's call volume, matches
# the architecture plan's read-only cross-service exception).


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
    completed = [c for c in calls if c["status"] == "completed"]
    successful = [c for c in completed if c.get("outcome") == "successful"]
    rate = (len(successful) / len(completed) * 100) if completed else 0.0
    return {"total_completed": len(completed), "successful": len(successful), "success_rate_pct": round(rate, 1)}


@router.get("/data-accuracy")
async def data_accuracy(use_case: str | None = None) -> dict:
    calls = await fetch_calls(use_case)
    completed = [c for c in calls if c["status"] == "completed" and c.get("outcome") is not None]
    fully_retrieved = [c for c in completed if not c.get("missing_fields")]
    rate = (len(fully_retrieved) / len(completed) * 100) if completed else 0.0
    return {
        "total_completed": len(completed),
        "fully_retrieved": len(fully_retrieved),
        "accuracy_pct": round(rate, 1),
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
    transferred = [c for c in calls if c.get("outcome") == "transferred_to_human"]
    failed = [c for c in calls if c["status"] == "failed"]
    return {
        "total_calls": len(calls),
        "transferred_to_human": len(transferred),
        "failed_calls": len(failed),
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
