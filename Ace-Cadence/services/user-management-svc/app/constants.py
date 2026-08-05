"""Business-rule value lists, ported verbatim from the current app
(convex/users.ts, convex/lib/specializations.ts) — see architecture plan
§3 "Status-field note" for why these are enforced in application code."""

VALID_ROLES = ["admin", "operator"]
VALID_USER_STATUSES = ["active", "disabled"]
VALID_SPECIALIZATIONS = ["claim_status", "denial_claim", "claim_eligibility_check"]
