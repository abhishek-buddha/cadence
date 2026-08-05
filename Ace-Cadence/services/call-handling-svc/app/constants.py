"""Business-rule value lists, ported verbatim from the current app
(convex/claims.ts, convex/dentalCases.ts, convex/schema.ts calls/callResults)
— see architecture plan §3 "Status-field note": claims.status validity and
transitions depend on use_case, so they're enforced in application code /
a BEFORE UPDATE trigger, not a MySQL ENUM."""

VALID_USE_CASES = ["medical_claim", "dental_ev"]

MEDICAL_CLAIM_STATUSES = [
    "pending",
    "in_progress",
    "paid",
    "denied",
    "appealing",
    "write_off",
]
DENTAL_EV_STATUSES = [
    "awaiting_verification",
    "verifying",
    "verified",
    "failed",
    "requires_human",
]

# Ported from convex/claims.ts / convex/dentalCases.ts transition graphs.
# Enforced here (application layer) until the MySQL BEFORE UPDATE trigger
# from the architecture plan is added alongside real Alembic migrations.
MEDICAL_CLAIM_TRANSITIONS = {
    "pending": {"in_progress"},
    "in_progress": {"paid", "denied", "pending"},
    "denied": {"appealing", "write_off"},
    "appealing": {"paid", "denied", "write_off"},
    "paid": set(),
    "write_off": set(),
}
DENTAL_EV_TRANSITIONS = {
    "awaiting_verification": {"verifying"},
    "verifying": {"verified", "failed", "requires_human"},
    "requires_human": {"verified", "failed"},
    "verified": set(),
    "failed": {"verifying"},
}

VALID_PRIORITIES = ["low", "medium", "high", "urgent"]

VALID_CALL_STATUSES = [
    "initiating",
    "in_progress",
    "completed",
    "failed",
    "no_answer",
]
VALID_CALL_OUTCOMES = ["successful", "partial", "failed", "transferred_to_human"]
VALID_HANDOFF_STATES = [
    "none",
    "awaiting_human",
    "accepting",
    "connected",
    "declined",
    "handoff_failed",
    "handoff_ended",
]
VALID_TRANSFER_TYPES = ["warm", "cold"]

VALID_FOLLOWUP_DISPOSITIONS = ["complete", "retry", "reschedule", "denied"]

VALID_SESSION_STATUSES = ["queued", "in_progress", "completed", "paused", "failed"]
MAX_SESSION_ITEMS = 5


def validate_status_transition(use_case: str, current: str, new: str) -> None:
    """Mirrors the BEFORE UPDATE trigger described in the architecture plan
    (§3, claims table) — kept here too so the API rejects an invalid
    transition before it ever reaches the database."""
    graph = MEDICAL_CLAIM_TRANSITIONS if use_case == "medical_claim" else DENTAL_EV_TRANSITIONS
    valid_statuses = MEDICAL_CLAIM_STATUSES if use_case == "medical_claim" else DENTAL_EV_STATUSES
    if new not in valid_statuses:
        raise ValueError(f"status must be one of {valid_statuses} for use_case={use_case}")
    if current == new:
        return
    if new not in graph.get(current, set()):
        raise ValueError(f"cannot transition claim from '{current}' to '{new}' (use_case={use_case})")


def validate_use_case(use_case: str) -> None:
    if use_case not in VALID_USE_CASES:
        raise ValueError(f"use_case must be one of {VALID_USE_CASES}")


def validate_initial_claim_status(use_case: str, status: str) -> None:
    valid_statuses = MEDICAL_CLAIM_STATUSES if use_case == "medical_claim" else DENTAL_EV_STATUSES
    if status not in valid_statuses:
        raise ValueError(f"status must be one of {valid_statuses} for use_case={use_case}")


def validate_priority(priority: str) -> None:
    if priority not in VALID_PRIORITIES:
        raise ValueError(f"priority must be one of {VALID_PRIORITIES}")


def validate_followup_disposition(disposition: str | None) -> None:
    if disposition is not None and disposition not in VALID_FOLLOWUP_DISPOSITIONS:
        raise ValueError(f"follow_up_disposition must be one of {VALID_FOLLOWUP_DISPOSITIONS}")


def validate_session_status(status: str | None) -> None:
    if status is not None and status not in VALID_SESSION_STATUSES:
        raise ValueError(f"status must be one of {VALID_SESSION_STATUSES}")


def validate_session_item_refs(item_refs: list) -> None:
    if len(item_refs) == 0 or len(item_refs) > MAX_SESSION_ITEMS:
        raise ValueError(f"a call session must have between 1 and {MAX_SESSION_ITEMS} items")
