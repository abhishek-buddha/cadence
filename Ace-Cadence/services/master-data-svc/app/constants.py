"""Business-rule value lists, ported verbatim from the current app
(convex/schema.ts insuranceContacts/patients fields) — see architecture plan
§3 "Status-field note" for why these are enforced in application code."""

VALID_PAYER_KINDS = ["medical", "dental"]
VALID_CALL_CONNECTION_TYPES = [
    "ivr_human_handoff",
    "ivr_only_cut_at_handoff",
    "direct_to_agent",
]
