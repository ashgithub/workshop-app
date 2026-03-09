"""Attendee detail and progress helpers for Oracle."""
from __future__ import annotations

from typing import Optional

from backend.database import db
from backend.services import intros as intro_service
from backend.services import onboarding as onboarding_service


def get_attendee(attendee_id: int) -> Optional[dict]:
    row = db.fetch_one(
        """
        SELECT a.ID, a.EMAIL, a.FULL_NAME, a.PROFILE_IMAGE, a.ACKNOWLEDGED,
               a.TITLE, a.MANAGER,
               c.ID, c.TITLE, c.LOCATION_NAME, c.ADDRESS, c.ROOM, c.START_DATE, c.END_DATE,
               c.START_TIME, c.END_TIME, c.AGENDA_URL
        FROM ATTENDEES a
        JOIN COHORTS c ON c.ID = a.COHORT_ID
        WHERE a.ID = :attendee_id
        """,
        {"attendee_id": attendee_id},
    )
    if not row:
        return None

    return {
        "attendee_id": row[0],
        "email": row[1],
        "full_name": row[2],
        "profile_image": row[3],
        "acknowledged": row[4] == 'Y',
        "title": row[5],
        "manager": row[6],
        "cohort": {
            "id": row[7],
            "title": row[8],
            "location_name": row[9],
            "address": row[10],
            "room": row[11],
            "start_date": row[12].isoformat() if row[12] else None,
            "end_date": row[13].isoformat() if row[13] else None,
            "start_time": row[14].isoformat() if row[14] else None,
            "end_time": row[15].isoformat() if row[15] else None,
            "agenda_url": row[16],
        },
    }


def get_progress(attendee_id: int) -> dict:
    onboarding = db.fetch_one(
        """
        SELECT
            COUNT(*) AS total_questions,
            COUNT(CASE WHEN TRIM(DBMS_LOB.SUBSTR(r.RESPONSE, 4000, 1)) = 'Y' THEN 1 END) AS answered
        FROM ONBOARDING_QUESTIONS q
        LEFT JOIN ATTENDEE_ONBOARDING_RESPONSES r
            ON r.QUESTION_ID = q.ID AND r.ATTENDEE_ID = :attendee_id
        WHERE q.ACTIVE = 'Y'
        """,
        {"attendee_id": attendee_id},
    ) or (0, 0)

    submissions = db.fetch_one(
        """
        SELECT COUNT(DISTINCT s.TEMPLATE_ID)
        FROM SURVEY_SUBMISSIONS s
        JOIN SURVEY_TEMPLATES t ON t.ID = s.TEMPLATE_ID
        JOIN SURVEY_ANSWERS a ON a.SUBMISSION_ID = s.ID
        WHERE s.ATTENDEE_ID = :attendee_id
          AND t.ACTIVE = 'Y'
          AND a.RESPONSE IS NOT NULL
          AND LENGTH(TRIM(a.RESPONSE)) > 0
        """,
        {"attendee_id": attendee_id},
    ) or (0,)

    survey_templates = db.fetch_one(
        """
        SELECT COUNT(*)
        FROM SURVEY_TEMPLATES
        WHERE ACTIVE = 'Y'
        """,
    ) or (0,)

    survey_question_totals = db.fetch_one(
        """
        SELECT COUNT(q.ID)
        FROM SURVEY_TEMPLATES t
        JOIN SURVEY_QUESTIONS q ON q.TEMPLATE_ID = t.ID
        WHERE t.ACTIVE = 'Y'
        """,
    ) or (0,)

    survey_question_answers = db.fetch_one(
        """
        SELECT COUNT(DISTINCT a.QUESTION_ID)
        FROM SURVEY_SUBMISSIONS s
        JOIN SURVEY_TEMPLATES t ON t.ID = s.TEMPLATE_ID
        JOIN SURVEY_ANSWERS a ON a.SUBMISSION_ID = s.ID
        WHERE s.ATTENDEE_ID = :attendee_id
          AND t.ACTIVE = 'Y'
          AND a.RESPONSE IS NOT NULL
          AND LENGTH(TRIM(a.RESPONSE)) > 0
        """,
        {"attendee_id": attendee_id},
    ) or (0,)

    intro = db.fetch_one(
        """
        SELECT
            COUNT(*) AS total_questions,
            COUNT(CASE WHEN r.RESPONSE IS NOT NULL AND LENGTH(TRIM(r.RESPONSE)) > 0 THEN 1 END) AS answered
        FROM INTRO_QUESTIONS q
        LEFT JOIN ATTENDEE_INTRO_RESPONSES r
            ON r.QUESTION_ID = q.ID AND r.ATTENDEE_ID = :attendee_id
        WHERE q.ACTIVE = 'Y'
        """,
        {"attendee_id": attendee_id},
    ) or (0, 0)

    ack_row = db.fetch_one(
        "SELECT ACKNOWLEDGED FROM ATTENDEES WHERE ID = :attendee_id",
        {"attendee_id": attendee_id},
    )
    ack_completed = bool(ack_row and ack_row[0] == 'Y')

    completed_onboarding = onboarding[1]
    total_onboarding = onboarding[0]
    total_surveys_completed = submissions[0]
    total_surveys_available = survey_templates[0] or 0
    survey_questions_total = survey_question_totals[0] or 0
    survey_questions_completed = min(survey_questions_total, survey_question_answers[0] or 0)
    if total_surveys_available == 0 and total_surveys_completed > 0:
        total_surveys_available = total_surveys_completed
    intro_total = intro[0]
    intro_completed = intro[1]
    ack_total = 1

    points_total = ack_total + total_onboarding + intro_total + survey_questions_total
    points_completed = (
        (1 if ack_completed else 0)
        + completed_onboarding
        + intro_completed
        + survey_questions_completed
    )

    overall = int(points_completed / points_total * 100) if points_total else 0

    return {
        "tasks_completed": completed_onboarding,
        "tasks_total": total_onboarding,
        "surveys_completed": total_surveys_completed,
        "surveys_total": total_surveys_available,
        "survey_questions_completed": survey_questions_completed,
        "survey_questions_total": survey_questions_total,
        "intro_completed": intro_completed,
        "intro_total": intro_total,
        "ack_completed": ack_completed,
        "ack_total": ack_total,
        "points_completed": points_completed,
        "points_total": points_total,
        "overall_progress": overall,
    }


def get_intro_responses(attendee_id: int) -> list[dict]:
    return intro_service.list_attendee_responses(attendee_id)


def update_attendee_ack(attendee_id: int, acknowledged: bool) -> bool:
    val = 'Y' if acknowledged else 'N'
    rowcount = db.execute_dml(
        """
        UPDATE ATTENDEES
        SET ACKNOWLEDGED = :val, UPDATED_AT = CURRENT_TIMESTAMP
        WHERE ID = :attendee_id
        """,
        {"val": val, "attendee_id": attendee_id},
    )
    return rowcount > 0
