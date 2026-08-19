"""Call outcome classification — 100% required-field retrieval = "successful".

Direct port of `convex/outcomeClassifier.ts` on the Render `cadence_pro_ivr`
baseline. Pure functions, no DB or HTTP: the field lists and the 50% partial
threshold are an RFP requirement, so they are kept identical to Render rather
than re-derived. Change these only alongside the Render implementation.
"""

from typing import Any

# Required fields per medical claim status. Keep in sync with Render.
MEDICAL_REQUIRED_FIELDS: dict[str, list[str]] = {
    "paid": ["claimStatus", "paidAmount", "paidDate", "checkOrEftNumber", "referenceNumber", "repName"],
    "denied": ["claimStatus", "denialCode", "denialReason", "appealDeadline", "referenceNumber", "repName"],
    "pending": ["claimStatus", "expectedDecisionDate", "referenceNumber", "repName"],
    "processing": ["claimStatus", "expectedDecisionDate", "referenceNumber", "repName"],
    "appealing": ["claimStatus", "expectedDecisionDate", "referenceNumber", "repName"],
}

DENTAL_EV_REQUIRED_BASE = ["isActive", "referenceNumber", "repName"]
DENTAL_EV_REQUIRED_IF_ACTIVE = [
    "deductibleAnnualCents",
    "deductibleMetCents",
    "annualMaximumCents",
    "annualMaxRemainingCents",
    "networkStatus",
    "coinsurancePct",
]

# Call statuses meaning the call never reached a rep — short-circuit to failed.
FAILED_CALL_STATUSES = ["voicemail", "no_answer", "ivr_only", "error", "abandoned", "busy"]


def failed_from_call_status(call_status: str | None) -> bool:
    if not call_status:
        return False
    return call_status in FAILED_CALL_STATUSES


def _has_value(value: Any) -> bool:
    """None, and empty/whitespace-only strings, count as missing. Note that 0
    and False are real values and must pass."""
    if value is None:
        return False
    if isinstance(value, str) and value.strip() == "":
        return False
    return True


def _classify_by_threshold(
    retrieved: list[str], missing: list[str], total: int, context_label: str
) -> dict:
    if not missing:
        return {
            "outcome": "successful",
            "requiredFieldsRetrieved": retrieved,
            "missingFields": [],
            "reason": f"All {total} required fields retrieved for {context_label}",
        }
    ratio = (len(retrieved) / total) if total else 0
    if ratio >= 0.5:
        return {
            "outcome": "partial",
            "requiredFieldsRetrieved": retrieved,
            "missingFields": missing,
            "reason": (
                f"{len(retrieved)}/{total} required fields retrieved for {context_label}; "
                f"missing: {', '.join(missing)}"
            ),
        }
    return {
        "outcome": "failed",
        "requiredFieldsRetrieved": retrieved,
        "missingFields": missing,
        "reason": f"Only {len(retrieved)}/{total} required fields retrieved for {context_label}",
    }


def classify_medical_call_outcome(call_result: dict | None, call_status: str | None = None) -> dict:
    if failed_from_call_status(call_status):
        return {
            "outcome": "failed",
            "requiredFieldsRetrieved": [],
            "missingFields": [],
            "reason": f"Call did not reach a rep (status: {call_status})",
        }
    if not call_result:
        return {
            "outcome": "failed",
            "requiredFieldsRetrieved": [],
            "missingFields": [],
            "reason": "No call result data available",
        }

    status = call_result.get("claimStatus") or ""
    required = MEDICAL_REQUIRED_FIELDS.get(status)

    if required is None:
        has = _has_value(call_result.get("claimStatus"))
        return {
            "outcome": "partial" if has else "failed",
            "requiredFieldsRetrieved": ["claimStatus"] if has else [],
            "missingFields": [] if has else ["claimStatus"],
            "reason": (
                f'Claim status "{status}" has no defined required field set; partial classification'
                if has
                else "No claim status determined"
            ),
        }

    retrieved, missing = [], []
    for field in required:
        (retrieved if _has_value(call_result.get(field)) else missing).append(field)
    return _classify_by_threshold(retrieved, missing, len(required), f'status "{status}"')


def classify_dental_call_outcome(ev_result: dict | None, call_status: str | None = None) -> dict:
    if failed_from_call_status(call_status):
        return {
            "outcome": "failed",
            "requiredFieldsRetrieved": [],
            "missingFields": [],
            "reason": f"Call did not reach a rep (status: {call_status})",
        }
    if not ev_result:
        return {
            "outcome": "failed",
            "requiredFieldsRetrieved": [],
            "missingFields": [],
            "reason": "No EV result data available",
        }

    is_active = ev_result.get("isActive")
    required = list(DENTAL_EV_REQUIRED_BASE)
    if is_active is True:
        required += DENTAL_EV_REQUIRED_IF_ACTIVE

    retrieved, missing = [], []
    for field in required:
        if field == "isActive":
            # False is a valid retrieved value here, not a missing one.
            (retrieved if is_active in (True, False) else missing).append(field)
            continue
        (retrieved if _has_value(ev_result.get(field)) else missing).append(field)
    return _classify_by_threshold(retrieved, missing, len(required), "dental EV")
