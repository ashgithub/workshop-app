"""Survey service helpers for Oracle-backed rebuild."""
from __future__ import annotations

from typing import List, Optional

from backend.database import db


def list_templates(active_only: bool = True) -> List[dict]:
    query = """
    SELECT ID, NAME, SLUG, DESCRIPTION, ACTIVE
    FROM SURVEY_TEMPLATES
    {where_clause}
    ORDER BY NAME
    """
    where_clause = "WHERE ACTIVE = 'Y'" if active_only else ""
    rows = db.execute_query(query.format(where_clause=where_clause))
    return [
        {
            "id": row[0],
            "name": row[1],
            "slug": row[2],
            "description": row[3],
            "active": row[4] == 'Y',
        }
        for row in rows
    ]


def list_questions(template_id: int) -> List[dict]:
    rows = db.execute_query(
        """
        SELECT ID, PROMPT, QUESTION_TYPE, OPTIONS, DISPLAY_ORDER, REQUIRED
        FROM SURVEY_QUESTIONS
        WHERE TEMPLATE_ID = :template_id
        ORDER BY DISPLAY_ORDER
        """,
        {"template_id": template_id},
    )
    return [
        {
            "id": row[0],
            "prompt": row[1],
            "question_type": row[2],
            "options": row[3],
            "display_order": row[4],
            "required": row[5] == 'Y',
        }
        for row in rows
    ]


def record_submission(attendee_id: int, template_id: int, answers: List[dict]) -> int:
    submission_id = db.execute_returning(
        """
        INSERT INTO SURVEY_SUBMISSIONS (ATTENDEE_ID, TEMPLATE_ID)
        VALUES (:attendee_id, :template_id)
        RETURNING ID INTO :out_id
        """,
        {"attendee_id": attendee_id, "template_id": template_id},
    )

    for answer in answers:
        db.execute_dml(
            """
            INSERT INTO SURVEY_ANSWERS (SUBMISSION_ID, QUESTION_ID, RESPONSE)
            VALUES (:submission_id, :question_id, :response)
            """,
            {
                "submission_id": submission_id,
                "question_id": answer["question_id"],
                "response": answer.get("response"),
            },
        )

    return submission_id


def get_submission(attendee_id: int, template_id: int) -> Optional[dict]:
    submission = db.fetch_one(
        """
        SELECT ID, SUBMITTED_AT
        FROM SURVEY_SUBMISSIONS
        WHERE ATTENDEE_ID = :attendee_id AND TEMPLATE_ID = :template_id
        """,
        {"attendee_id": attendee_id, "template_id": template_id},
    )
    if not submission:
        return None

    answers = db.execute_query(
        """
        SELECT QUESTION_ID, RESPONSE
        FROM SURVEY_ANSWERS
        WHERE SUBMISSION_ID = :submission_id
        """,
        {"submission_id": submission[0]},
    )
    return {
        "submission_id": submission[0],
        "submitted_at": submission[1].isoformat() if submission[1] else None,
        "answers": [{"question_id": row[0], "response": row[1]} for row in answers],
    }
