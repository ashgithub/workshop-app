"""Service layer for Oracle cohort, attendee, and task operations."""
from __future__ import annotations

from typing import List, Optional

from backend.database import db


def list_cohorts() -> List[dict]:
    rows = db.execute_query(
        """
        SELECT ID, COHORT_CODE, TITLE, LOCATION_NAME, ADDRESS, ROOM, START_DATE, END_DATE, AGENDA_URL
        FROM COHORTS
        ORDER BY START_DATE NULLS LAST, TITLE
        """
    )
    return [
        {
            "id": row[0],
            "cohort_code": row[1],
            "title": row[2],
            "location_name": row[3],
            "address": row[4],
            "room": row[5],
            "start_date": row[6].isoformat() if row[6] else None,
            "end_date": row[7].isoformat() if row[7] else None,
            "agenda_url": row[8],
        }
        for row in rows
    ]


def create_cohort(data: dict) -> int:
    query = """
    INSERT INTO COHORTS (COHORT_CODE, TITLE, LOCATION_NAME, ADDRESS, ROOM, START_DATE, END_DATE, AGENDA_URL)
    VALUES (:cohort_code, :title, :location_name, :address, :room,
            TO_DATE(:start_date, 'YYYY-MM-DD'), TO_DATE(:end_date, 'YYYY-MM-DD'), :agenda_url)
    RETURNING ID INTO :out_id
    """
    params = {
        "cohort_code": data["cohort_code"],
        "title": data["title"],
        "location_name": data.get("location_name"),
        "address": data.get("address"),
        "room": data.get("room"),
        "start_date": data.get("start_date"),
        "end_date": data.get("end_date"),
        "agenda_url": data.get("agenda_url"),
    }
    return db.execute_returning(query, params)


def add_attendee(data: dict) -> int:
    query = """
    INSERT INTO ATTENDEES (COHORT_ID, EMAIL, FULL_NAME)
    VALUES (:cohort_id, :email, :full_name)
    RETURNING ID INTO :out_id
    """
    return db.execute_returning(query, data)


def find_attendee_by_email(cohort_id: int, email: str) -> Optional[dict]:
    row = db.fetch_one(
        """
        SELECT ID, FULL_NAME
        FROM ATTENDEES
        WHERE COHORT_ID = :cohort_id AND UPPER(EMAIL) = UPPER(:email)
        """,
        {"cohort_id": cohort_id, "email": email},
    )
    if not row:
        return None
    return {"id": row[0], "full_name": row[1]}


def list_task_templates() -> List[dict]:
    rows = db.execute_query(
        """
        SELECT ID, TITLE, DESCRIPTION, INSTRUCTIONS_URL, REQUIRED, DISPLAY_ORDER
        FROM ONBOARDING_TASK_TEMPLATES
        ORDER BY DISPLAY_ORDER, TITLE
        """
    )
    return [
        {
            "id": row[0],
            "title": row[1],
            "description": row[2],
            "instructions_url": row[3],
            "required": row[4] == 'Y',
            "display_order": row[5],
        }
        for row in rows
    ]


def create_task_template(data: dict) -> int:
    query = """
    INSERT INTO ONBOARDING_TASK_TEMPLATES (TITLE, DESCRIPTION, INSTRUCTIONS_URL, REQUIRED, DISPLAY_ORDER)
    VALUES (:title, :description, :instructions_url, :required, :display_order)
    RETURNING ID INTO :out_id
    """
    params = {
        "title": data["title"],
        "description": data.get("description"),
        "instructions_url": data.get("instructions_url"),
        "required": 'Y' if data.get("required", True) else 'N',
        "display_order": data.get("display_order", 0),
    }
    return db.execute_returning(query, params)


def link_template_to_cohort(cohort_id: int, template_id: int, order: int) -> None:
    db.execute_dml(
        """
        MERGE INTO COHORT_TASK_TEMPLATES t
        USING (SELECT :cohort_id AS COHORT_ID, :template_id AS TEMPLATE_ID FROM DUAL) src
        ON (t.COHORT_ID = src.COHORT_ID AND t.TEMPLATE_ID = src.TEMPLATE_ID)
        WHEN NOT MATCHED THEN
            INSERT (COHORT_ID, TEMPLATE_ID, DISPLAY_ORDER)
            VALUES (:cohort_id, :template_id, :display_order)
        WHEN MATCHED THEN
            UPDATE SET DISPLAY_ORDER = :display_order
        """,
        {"cohort_id": cohort_id, "template_id": template_id, "display_order": order},
    )


def generate_attendee_tasks(attendee_id: int, cohort_id: int) -> int:
    assignments = db.execute_query(
        """
        SELECT TEMPLATE_ID, DISPLAY_ORDER
        FROM COHORT_TASK_TEMPLATES
        WHERE COHORT_ID = :cohort_id
        ORDER BY DISPLAY_ORDER
        """,
        {"cohort_id": cohort_id},
    )
    created = 0
    for template_id, _ in assignments:
        try:
            db.execute_dml(
                """
                INSERT INTO ATTENDEE_TASKS (ATTENDEE_ID, TEMPLATE_ID, STATUS)
                VALUES (:attendee_id, :template_id, 'PENDING')
                """,
                {"attendee_id": attendee_id, "template_id": template_id},
            )
            created += 1
        except Exception:
            continue
    return created


def list_attendee_tasks(attendee_id: int) -> List[dict]:
    rows = db.execute_query(
        """
        SELECT t.ID, tpl.TITLE, tpl.DESCRIPTION, tpl.INSTRUCTIONS_URL, tpl.REQUIRED, t.STATUS, t.COMPLETED_AT
        FROM ATTENDEE_TASKS t
        JOIN ONBOARDING_TASK_TEMPLATES tpl ON tpl.ID = t.TEMPLATE_ID
        WHERE t.ATTENDEE_ID = :attendee_id
        ORDER BY tpl.DISPLAY_ORDER
        """,
        {"attendee_id": attendee_id},
    )
    return [
        {
            "task_id": row[0],
            "title": row[1],
            "description": row[2],
            "instructions_url": row[3],
            "required": row[4] == 'Y',
            "status": row[5],
            "completed_at": row[6].isoformat() if row[6] else None,
        }
        for row in rows
    ]


def update_attendee_task(task_id: int, status: str, notes: Optional[str] = None) -> None:
    db.execute_dml(
        """
        UPDATE ATTENDEE_TASKS
        SET STATUS = :status,
            COMPLETED_AT = CASE WHEN :status = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END,
            NOTES = :notes
        WHERE ID = :task_id
        """,
        {"status": status, "notes": notes, "task_id": task_id},
    )
