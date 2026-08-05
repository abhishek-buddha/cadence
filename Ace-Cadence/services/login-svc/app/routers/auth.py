import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.audit import write_audit_event
from common.db import get_db
from common.serialize import row_to_dict

from ..config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/verify-pin")
async def verify_pin(body: dict) -> dict:
    """The app-wide PIN gate (AccessCodePage in the current app). Constant-
    time comparison so response timing can't leak the correct code."""
    pin = body.get("pin", "")
    valid = hmac.compare_digest(str(pin), settings.access_code)
    return {"valid": valid}


@router.post("/session", status_code=201)
async def create_session(body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    """Issues a session for the user picked on the LoginSelectPage-equivalent
    screen. Demo-grade: trusts the caller's claim of who this user is,
    same as the current app's pick-a-user flow (no password on the user).
    The frontend already fetched the user list from user-management-svc and
    passes the chosen user's identity here."""
    for field in ("user_id", "user_email", "user_role"):
        if field not in body:
            raise HTTPException(status_code=422, detail=f"Missing field: {field}")

    now = datetime.now(timezone.utc)
    session_token = secrets.token_hex(32)
    expires_at = now + timedelta(hours=settings.session_ttl_hours)

    result = await db.execute(
        text(
            """
            INSERT INTO sessions
                (session_token, user_id, user_email, user_role, user_name, created_at, expires_at)
            VALUES
                (:session_token, :user_id, :user_email, :user_role, :user_name, :created_at, :expires_at)
            """
        ),
        {
            "session_token": session_token,
            "user_id": body["user_id"],
            "user_email": body["user_email"],
            "user_role": body["user_role"],
            "user_name": body.get("user_name"),
            "created_at": now,
            "expires_at": expires_at,
        },
    )
    await write_audit_event(
        db,
        action="login",
        resource_type="session",
        resource_id=str(body["user_id"]),
        user_id=str(body["user_id"]),
        user_email=body["user_email"],
        user_role=body["user_role"],
    )
    await db.commit()

    row = await db.execute(
        text("SELECT * FROM sessions WHERE id = :id"), {"id": result.lastrowid}
    )
    return row_to_dict(row.first())


@router.get("/session/{token}")
async def get_session(token: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Validates a session token — called by other services (or an nginx
    auth_request subrequest) to resolve "who is this" for a given request."""
    result = await db.execute(text("SELECT * FROM sessions WHERE session_token = :token"), {"token": token})
    session = result.first()
    if session is None:
        raise HTTPException(status_code=401, detail="Invalid session")
    if session.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    return row_to_dict(session)


@router.delete("/session/{token}")
async def logout(token: str, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(text("SELECT * FROM sessions WHERE session_token = :token"), {"token": token})
    session = result.first()
    if session is not None:
        await write_audit_event(
            db,
            action="logout",
            resource_type="session",
            resource_id=str(session.user_id),
            user_id=str(session.user_id),
            user_email=session.user_email,
            user_role=session.user_role,
        )
        await db.execute(text("DELETE FROM sessions WHERE session_token = :token"), {"token": token})
        await db.commit()
    return {"success": True}
