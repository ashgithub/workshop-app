"""
Authentication router for login and autocomplete endpoints.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List
import logging

from ..database import db
from ..schemas import LoginRequest, LoginResponse, AutocompleteResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/login", response_model=LoginResponse)
async def login(login_data: LoginRequest):
    """
    Authenticate user by email address.
    Returns user details and admin status.
    """
    try:
        email = login_data.email

        # Special case: hardcoded admin email
        if email.lower() == 'ashish.ag.agarwal@oracle.com':
            return LoginResponse(
                student_id='ADMIN_USER',
                name='Admin User',
                is_admin=True
            )

        # For regular users, check database
        query = """
        SELECT STUDENT_ID, NAME, EMAIL_ADDRESS
        FROM STUDENTS
        WHERE UPPER(EMAIL_ADDRESS) = UPPER(:email)
        """

        result = db.execute_query(query, {"email": email})

        if not result:
            raise HTTPException(status_code=404, detail="User not found")

        row = result[0]
        student_id = row[0]
        name = row[1]

        return LoginResponse(
            student_id=student_id,
            name=name,
            is_admin=False
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error for email {login_data.email}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/attendees/autocomplete", response_model=AutocompleteResponse)
async def autocomplete_emails(q: str = Query(..., min_length=2, max_length=100)):
    """
    Return email addresses that start with the query string.
    Used for email autocomplete in login form.
    """
    try:
        query = """
        SELECT EMAIL_ADDRESS
        FROM STUDENTS
        WHERE UPPER(EMAIL_ADDRESS) LIKE UPPER(:query || '%')
        ORDER BY EMAIL_ADDRESS
        FETCH FIRST 10 ROWS ONLY
        """

        result = db.execute_query(query, {"query": q})

        emails = [row[0] for row in result] if result else []

        return AutocompleteResponse(emails=emails)

    except Exception as e:
        logger.error(f"Autocomplete error for query '{q}': {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
