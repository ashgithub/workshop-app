"""Authentication endpoints for the rebuilt workshop system."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..config import config
from ..database import db
from ..schemas import AutocompleteResponse, LoginRequest, LoginResponse

router = APIRouter()
logger = logging.getLogger(__name__)


def _authenticate_admin(email: str, password: Optional[str]) -> LoginResponse:
    if password is None or password != config.admin_shared_password:
        logger.error(f"{password} <> {config.admin_shared_password}")
        raise HTTPException(status_code=401, detail=f"Invalid admin credentials")

    rows = db.execute_query(
        "SELECT ID, FULL_NAME, IS_ACTIVE FROM ADMIN_USERS WHERE UPPER(EMAIL) = UPPER(:email)",
        {"email": email},
    )
    if not rows:
        raise HTTPException(status_code=403, detail="Admin account not found")

    admin_id, full_name, is_active = rows[0]
    if is_active != 'Y':
        raise HTTPException(status_code=403, detail="Admin account inactive")

    return LoginResponse(user_id=f"ADMIN_{admin_id}", name=full_name, is_admin=True)


def _authenticate_attendee(email: str) -> LoginResponse:
    rows = db.execute_query(
        """
        SELECT A.ID, A.FULL_NAME, A.COHORT_ID
        FROM ATTENDEES A
        WHERE UPPER(A.EMAIL) = UPPER(:email)
        """,
        {"email": email},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Attendee not found")

    attendee_id, full_name, cohort_id = rows[0]
    return LoginResponse(user_id=f"ATTENDEE_{attendee_id}", name=full_name, is_admin=False, cohort_id=cohort_id)


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest) -> LoginResponse:
    try:
        if payload.is_admin:
            return _authenticate_admin(payload.email, payload.admin_password)
        return _authenticate_attendee(payload.email)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("Login failure for %s: %s", payload.email, exc)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/attendees/autocomplete", response_model=AutocompleteResponse)
async def autocomplete_emails(q: str = Query(..., min_length=2, max_length=120)) -> AutocompleteResponse:
    try:
        rows = db.execute_query(
            """
            SELECT EMAIL
            FROM ATTENDEES
            WHERE UPPER(EMAIL) LIKE UPPER(:pattern)
            ORDER BY EMAIL
            FETCH FIRST 10 ROWS ONLY
            """,
            {"pattern": f"{q.upper()}%"},
        )
        emails = [row[0] for row in rows] if rows else []
        return AutocompleteResponse(emails=emails)
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("Autocomplete failed for %s: %s", q, exc)
        raise HTTPException(status_code=500, detail="Internal server error")
