"""Attendee detail and progress helpers for Oracle."""
from __future__ import annotations

from typing import Optional

from backend.database import db
from backend.services import intros as intro_service


def get_attendee(attendee_id: int) -> Optional[dict]:
    row = db.fetch_one(
        """
        SELECT a.ID, a.EMAIL, a.FULL_NAME,
               c.ID, c.TITLE, c.LOCATION_NAME, c.ADDRESS, c.ROOM, c.START_DATE, c.END_DATE,
               c.START_TIME, c.END_TIME
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
        "cohort": {
            "id": row[3],
            "title": row[4],
            "location_name": row[5],
            "address": row[6],
            "room": row[7],
            "start_date": row[8].isoformat() if row[8] else None,
            "end_date": row[9].isoformat() if row[9] else None,
            "start_time": row[10].isoformat() if row[10] else None,
            "end_time": row[11].isoformat() if row[11] else None,
        },
    }


def get_progress(attendee_id: int) -> dict:
    tasks = db.fetch_one(
        """
        SELECT COUNT(*), COUNT(CASE WHEN STATUS = 'COMPLETED' THEN 1 END)
        FROM ATTENDEE_TASKS
        WHERE ATTENDEE_ID = :attendee_id
        """,
        {"attendee_id": attendee_id},
    ) or (0, 0)

    submissions = db.fetch_one(
        """
        SELECT COUNT(*)
        FROM SURVEY_SUBMISSIONS
        WHERE ATTENDEE_ID = :attendee_id
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

    completed_tasks = tasks[1]
    total_tasks = tasks[0]
    total_surveys_completed = submissions[0]
    total_surveys_available = survey_templates[0] or 0
    if total_surveys_available == 0 and total_surveys_completed > 0:
        total_surveys_available = total_surveys_completed
    intro_total = intro[0]
    intro_completed = intro[1]
    ack_total = 1
    ack_completed = False

    progress_components = []
    if ack_total:
        progress_components.append(1.0 if ack_completed else 0.0)
    if total_tasks:
        progress_components.append(completed_tasks / total_tasks)
    if intro_total:
        progress_components.append(intro_completed / intro_total)
    if total_surveys_available:
        progress_components.append(total_surveys_completed / total_surveys_available)
    elif total_surveys_completed:
        progress_components.append(1.0)

    overall = 0
    if progress_components:
        overall = int(sum(progress_components) / len(progress_components) * 100)

    return {
        "tasks_completed": completed_tasks,
        "tasks_total": total_tasks,
        "surveys_completed": total_surveys_completed,
        "surveys_total": total_surveys_available,
        "intro_completed": intro_completed,
        "intro_total": intro_total,
        "ack_completed": ack_completed,
        "ack_total": ack_total,
        "overall_progress": overall,
    }


def get_intro_responses(attendee_id: int) -> list[dict]:
    return intro_service.list_attendee_responses(attendee_id)
