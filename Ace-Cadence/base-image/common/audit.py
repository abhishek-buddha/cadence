"""Shared audit-logging helper for the `audit_events` table (created
separately, not defined as an ORM model here — see common/db.py).

Every service calls `write_audit_event()` directly instead of going through
a dedicated audit service (see architecture plan, Decision D5) — written
synchronously, in-line with whatever request triggered it.
"""

from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

AuditAction = Literal[
    "create", "read", "update", "delete", "login", "logout", "transfer", "export"
]


async def write_audit_event(
    db: AsyncSession,
    *,
    action: AuditAction,
    resource_type: str,
    resource_id: str | None = None,
    user_id: str | None = None,
    user_email: str | None = None,
    user_role: str | None = None,
    phi_accessed: bool | None = None,
    payload_summary: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Inserts one audit_events row on the current connection/transaction.
    Does NOT commit — call this inside the same transaction as the write
    it's auditing, so a rolled-back request never leaves an orphaned audit
    row behind."""
    await db.execute(
        text(
            """
            INSERT INTO audit_events
                (user_id, user_email, user_role, action, resource_type, resource_id,
                 phi_accessed, payload_summary, ip_address, user_agent, timestamp)
            VALUES
                (:user_id, :user_email, :user_role, :action, :resource_type, :resource_id,
                 :phi_accessed, :payload_summary, :ip_address, :user_agent, :timestamp)
            """
        ),
        {
            "user_id": user_id,
            "user_email": user_email,
            "user_role": user_role,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "phi_accessed": phi_accessed,
            "payload_summary": payload_summary,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "timestamp": datetime.now(timezone.utc),
        },
    )
