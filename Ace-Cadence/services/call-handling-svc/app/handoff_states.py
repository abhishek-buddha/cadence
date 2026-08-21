"""Handoff states that mean "this call is still live with an operator".

Single source of truth. It lives in its own module because both `routers.handoff`
and `routers.twilio_compat` need it and `twilio_compat` already imports from
`handoff` — defining it in either would force a circular import or a second copy,
and a duplicated definition of *this* list would silently desync the operator
queue from the call-closing logic.
"""

LIVE_HANDOFF_STATES = ("awaiting_human", "accepting", "connected")

# Inlined into SQL rather than bound: SQLAlchemy needs expanding=True to expand a
# sequence into an IN list, and these are fixed internal constants (no user input).
LIVE_HANDOFF_STATES_SQL = ", ".join(f"'{state}'" for state in LIVE_HANDOFF_STATES)
