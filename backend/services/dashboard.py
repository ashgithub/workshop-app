"""Aggregated analytics helpers for the admin progress dashboard."""
from __future__ import annotations

from typing import Dict, List

from backend.database import db
from backend.services import intros as intro_service
from backend.services import onboarding as onboarding_service


class CohortNotFoundError(Exception):
    """Raised when a cohort lookup fails."""


def get_dashboard_summary(cohort_id: int, include_test: bool = False) -> dict:
    """Return aggregated dashboard data for a cohort."""

    cohort = _get_cohort_details(cohort_id)
    include_flag = 1 if include_test else 0

    headline = fetch_headline_stats(cohort_id, include_flag)
    total_attendees = headline["attendees_total"]

    intro = fetch_intro_stats(cohort_id, include_flag, total_attendees)
    onboarding = fetch_onboarding_stats(cohort_id, include_flag, total_attendees)
    surveys = fetch_survey_stats(cohort_id, include_flag, total_attendees)

    return {
        "headline": headline,
        "intro": intro,
        "onboarding": onboarding,
        "surveys": surveys,
        "meta": {
            "cohort_id": cohort["id"],
            "cohort_title": cohort["title"],
            "include_test": include_test,
            "total_attendees": total_attendees,
        },
    }


def fetch_headline_stats(cohort_id: int, include_flag: int) -> dict:
    row = db.fetch_one(
        """
        SELECT
            COUNT(*) AS total_attendees,
            SUM(CASE WHEN ACKNOWLEDGED = 'Y' THEN 1 ELSE 0 END) AS acknowledged_attendees
        FROM ATTENDEES
        WHERE COHORT_ID = :cohort_id
          AND (:include_test = 1 OR NVL(IS_TEST, 'N') = 'N')
        """,
        {"cohort_id": cohort_id, "include_test": include_flag},
    )

    total = int(row[0]) if row and row[0] is not None else 0
    acknowledged = int(row[1]) if row and row[1] is not None else 0

    return {
        "attendees_total": total,
        "attendees_accepted": acknowledged,
    }


def fetch_intro_stats(cohort_id: int, include_flag: int, total_attendees: int) -> dict:
    questions = intro_service.list_questions()
    text_questions: List[dict] = []
    device_pref = None
    tshirt_size = None

    for question in questions:
        question_id = question["id"]
        completed = _count_intro_responses(question_id, cohort_id, include_flag)
        pending = max(total_attendees - completed, 0)

        if question.get("question_type") == "choice" and question.get("code") in {"device_pref", "tshirt_size"}:
            breakdown = _choice_breakdown(question, cohort_id, include_flag)
            block = {
                "code": question["code"],
                "label": question["prompt"],
                "completed": completed,
                "total": total_attendees,
                "breakdown": breakdown,
            }
            if question["code"] == "device_pref":
                device_pref = block
            else:
                tshirt_size = block
        else:
            text_questions.append(
                {
                    "code": question["code"],
                    "label": question["prompt"],
                    "completed": completed,
                    "pending": pending,
                    "total": total_attendees,
                }
            )

    return {
        "questions": text_questions,
        "device_pref": device_pref,
        "tshirt_size": tshirt_size,
    }


def fetch_onboarding_stats(cohort_id: int, include_flag: int, total_attendees: int) -> List[dict]:
    stats: List[dict] = []
    questions = onboarding_service.list_questions()

    for question in questions:
        question_id = question["id"]
        completed = _count_onboarding_responses(question_id, cohort_id, include_flag)
        pending = max(total_attendees - completed, 0)
        stats.append(
            {
                "code": question["code"],
                "label": question["prompt"],
                "completed": completed,
                "pending": pending,
                "total": total_attendees,
                "display_order": question.get("display_order", 0),
            }
        )

    stats.sort(key=lambda item: (item.get("display_order", 0), item["code"]))
    return stats


def fetch_survey_stats(cohort_id: int, include_flag: int, total_attendees: int) -> List[dict]:
    rows = db.execute_query(
        """
        SELECT
            t.ID,
            t.NAME,
            t.DISPLAY_ORDER,
            SUM(
                CASE
                    WHEN a.COHORT_ID = :cohort_id
                         AND (:include_test = 1 OR NVL(a.IS_TEST, 'N') = 'N')
                    THEN 1 ELSE 0
                END
            ) AS completed_count
        FROM SURVEY_TEMPLATES t
        LEFT JOIN SURVEY_SUBMISSIONS s ON s.TEMPLATE_ID = t.ID
        LEFT JOIN ATTENDEES a ON a.ID = s.ATTENDEE_ID
        WHERE t.ACTIVE = 'Y'
        GROUP BY t.ID, t.NAME, t.DISPLAY_ORDER
        ORDER BY t.DISPLAY_ORDER, t.ID
        """,
        {"cohort_id": cohort_id, "include_test": include_flag},
    )

    stats: List[dict] = []
    for row in rows or []:
        template_id, name, display_order, completed = row
        completed_count = int(completed or 0)
        stats.append(
            {
                "template_id": template_id,
                "name": name,
                "completed": completed_count,
                "expected": total_attendees,
                "display_order": display_order or 0,
            }
        )

    return stats


def _count_intro_responses(question_id: int, cohort_id: int, include_flag: int) -> int:
    row = db.fetch_one(
        """
        SELECT COUNT(*)
        FROM ATTENDEE_INTRO_RESPONSES r
        JOIN ATTENDEES a ON a.ID = r.ATTENDEE_ID
        WHERE r.QUESTION_ID = :question_id
          AND a.COHORT_ID = :cohort_id
          AND (:include_test = 1 OR NVL(a.IS_TEST, 'N') = 'N')
          AND r.RESPONSE IS NOT NULL AND LENGTH(TRIM(r.RESPONSE)) > 0
        """,
        {
            "question_id": question_id,
            "cohort_id": cohort_id,
            "include_test": include_flag,
        },
    )
    return int(row[0]) if row and row[0] is not None else 0


def _choice_breakdown(question: dict, cohort_id: int, include_flag: int) -> List[dict]:
    options = []
    config = question.get("config") or {}
    if isinstance(config, dict):
        options = config.get("options") or []

    # Oracle does not allow grouping/comparing on CLOB values directly (ORA-22848).
    # Convert to VARCHAR2 using DBMS_LOB.SUBSTR before trimming/grouping.
    response_expr = "TRIM(DBMS_LOB.SUBSTR(r.RESPONSE, 4000, 1))"

    rows = db.execute_query(
        f"""
        SELECT {response_expr} AS response_value, COUNT(*) AS response_count
        FROM ATTENDEE_INTRO_RESPONSES r
        JOIN ATTENDEES a ON a.ID = r.ATTENDEE_ID
        WHERE r.QUESTION_ID = :question_id
          AND a.COHORT_ID = :cohort_id
          AND (:include_test = 1 OR NVL(a.IS_TEST, 'N') = 'N')
          AND r.RESPONSE IS NOT NULL AND LENGTH(TRIM(r.RESPONSE)) > 0
        GROUP BY {response_expr}
        """,
        {
            "question_id": question["id"],
            "cohort_id": cohort_id,
            "include_test": include_flag,
        },
    )

    counts: Dict[str, int] = {}
    for row in rows or []:
        value = row[0] if row[0] is not None else ""
        counts[value] = int(row[1] or 0)

    breakdown: List[dict] = []
    option_labels = {
        str(opt.get("value")): opt.get("label", opt.get("value"))
        for opt in options
        if isinstance(opt, dict) and opt.get("value") is not None
    }

    for opt in options:
        if not isinstance(opt, dict) or opt.get("value") is None:
            continue
        value = str(opt["value"])
        breakdown.append(
            {
                "value": value,
                "label": opt.get("label", value),
                "count": counts.get(value, 0),
            }
        )

    for value, count in counts.items():
        if value not in option_labels:
            breakdown.append(
                {
                    "value": value,
                    "label": value,
                    "count": count,
                }
            )

    return breakdown


def _count_onboarding_responses(question_id: int, cohort_id: int, include_flag: int) -> int:
    row = db.fetch_one(
        """
        SELECT COUNT(*)
        FROM ATTENDEE_ONBOARDING_RESPONSES r
        JOIN ATTENDEES a ON a.ID = r.ATTENDEE_ID
        WHERE r.QUESTION_ID = :question_id
          AND a.COHORT_ID = :cohort_id
          AND (:include_test = 1 OR NVL(a.IS_TEST, 'N') = 'N')
          AND TRIM(DBMS_LOB.SUBSTR(r.RESPONSE, 4000, 1)) = 'Y'
        """,
        {
            "question_id": question_id,
            "cohort_id": cohort_id,
            "include_test": include_flag,
        },
    )
    return int(row[0]) if row and row[0] is not None else 0


def _get_cohort_details(cohort_id: int) -> dict:
    row = db.fetch_one(
        """
        SELECT ID, TITLE
        FROM COHORTS
        WHERE ID = :cohort_id
        """,
        {"cohort_id": cohort_id},
    )
    if not row:
        raise CohortNotFoundError
    return {"id": row[0], "title": row[1]}
