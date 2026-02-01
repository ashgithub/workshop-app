"""Onboarding questions management service for MDC_WORKSHOP schema."""
from __future__ import annotations

import json
from typing import Dict, Iterable, List, Optional

from backend.database import db


def _normalize_lob(value):
    """Return string value for Oracle LOBs so FastAPI can serialize the payload."""
    if value is None:
        return None
    read_attr = getattr(value, "read", None)
    if callable(read_attr):
        try:
            return read_attr()
        except Exception:  # Fallback to str conversion if read fails
            return str(value)
    return value


def _parse_config(value):
    parsed = _normalize_lob(value)
    if not parsed:
        return None
    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, (bytes, bytearray)):
        parsed = parsed.decode("utf-8", errors="ignore")
    if isinstance(parsed, str):
        try:
            return json.loads(parsed)
        except (json.JSONDecodeError, TypeError):
            return None
    return None


def list_questions(include_inactive: bool = False) -> List[dict]:
    filters = "" if include_inactive else "WHERE ACTIVE = 'Y'"
    rows = db.execute_query(
        f"""
        SELECT ID, CODE, PROMPT, DISPLAY_ORDER, REQUIRED, ACTIVE, QUESTION_TYPE, CONFIG
        FROM ONBOARDING_QUESTIONS
        {filters}
        ORDER BY DISPLAY_ORDER, ID
        """
    ) or []

    return [
        {
            "id": row[0],
            "code": row[1],
            "prompt": row[2],
            "display_order": row[3],
            "required": row[4] == 'Y',
            "active": row[5] == 'Y',
            "question_type": row[6],
            "config": _parse_config(row[7]),
        }
        for row in rows
    ]


def get_question(question_id: int) -> Optional[dict]:
    row = db.fetch_one(
        """
        SELECT ID, CODE, PROMPT, DISPLAY_ORDER, REQUIRED, ACTIVE, QUESTION_TYPE, CONFIG
        FROM ONBOARDING_QUESTIONS
        WHERE ID = :question_id
        """,
        {"question_id": question_id},
    )

    if not row:
        return None

    return {
        "id": row[0],
        "code": row[1],
        "prompt": row[2],
        "display_order": row[3],
        "required": row[4] == 'Y',
        "active": row[5] == 'Y',
        "question_type": row[6],
        "config": _parse_config(row[7]),
    }


def create_question(payload: dict) -> int:
    query = """
        INSERT INTO ONBOARDING_QUESTIONS (CODE, PROMPT, DISPLAY_ORDER, REQUIRED, ACTIVE, QUESTION_TYPE, CONFIG)
        VALUES (:code, :prompt, :display_order, :required, :active, :question_type, :config)
        RETURNING ID INTO :out_id
    """
    params = {
        "code": payload["code"],
        "prompt": payload["prompt"],
        "display_order": payload.get("display_order", 0),
        "required": 'Y' if payload.get("required", True) else 'N',
        "active": 'Y' if payload.get("active", True) else 'N',
        "question_type": payload.get("question_type", "text"),
        "config": json.dumps(payload.get("config")) if payload.get("config") is not None else None,
    }
    return db.execute_returning(query, params)


def update_question(question_id: int, payload: dict) -> None:
    fields = []
    params: Dict[str, object] = {"question_id": question_id}

    if "code" in payload:
        fields.append("CODE = :code")
        params["code"] = payload["code"]
    if "prompt" in payload:
        fields.append("PROMPT = :prompt")
        params["prompt"] = payload["prompt"]
    if "display_order" in payload:
        fields.append("DISPLAY_ORDER = :display_order")
        params["display_order"] = payload["display_order"]
    if "required" in payload:
        fields.append("REQUIRED = :required")
        params["required"] = 'Y' if payload["required"] else 'N'
    if "active" in payload:
        fields.append("ACTIVE = :active")
        params["active"] = 'Y' if payload["active"] else 'N'
    if "question_type" in payload:
        fields.append("QUESTION_TYPE = :question_type")
        params["question_type"] = payload["question_type"]
    if "config" in payload:
        fields.append("CONFIG = :config")
        params["config"] = json.dumps(payload["config"]) if payload["config"] is not None else None

    if not fields:
        return

    set_clause = ", ".join(fields)
    db.execute_dml(
        f"""
        UPDATE ONBOARDING_QUESTIONS
        SET {set_clause}, UPDATED_AT = CURRENT_TIMESTAMP
        WHERE ID = :question_id
        """,
        params,
    )


def reorder_questions(order_map: Iterable[dict]) -> None:
    for item in order_map:
        db.execute_dml(
            """
            UPDATE ONBOARDING_QUESTIONS
            SET DISPLAY_ORDER = :display_order, UPDATED_AT = CURRENT_TIMESTAMP
            WHERE ID = :question_id
            """,
            {"display_order": item["display_order"], "question_id": item["id"]},
        )


def list_attendee_responses(attendee_id: int) -> List[dict]:
    rows = db.execute_query(
        """
        SELECT q.ID, q.PROMPT, q.CODE, q.DISPLAY_ORDER, q.REQUIRED, q.QUESTION_TYPE, q.CONFIG,
               r.ID, r.RESPONSE, r.UPDATED_AT
        FROM ONBOARDING_QUESTIONS q
        LEFT JOIN ATTENDEE_ONBOARDING_RESPONSES r
            ON r.QUESTION_ID = q.ID AND r.ATTENDEE_ID = :attendee_id
        WHERE q.ACTIVE = 'Y'
        ORDER BY q.DISPLAY_ORDER, q.ID
        """,
        {"attendee_id": attendee_id},
    ) or []

    responses = []
    for row in rows:
        responses.append(
            {
                "question_id": row[0],
                "prompt": row[1],
                "code": row[2],
                "display_order": row[3],
                "required": row[4] == 'Y',
                "question_type": row[5],
                "config": _parse_config(row[6]),
                "response_id": row[7],
                "response": _normalize_lob(row[8]),
                "updated_at": row[9].isoformat() if row[9] else None,
            }
        )
    return responses


def save_response(attendee_id: int, question_id: int, response: Optional[str]) -> int:
    params = {
        "attendee_id": attendee_id,
        "question_id": question_id,
        "response": response,
    }

    return db.execute_returning(
        """
        MERGE INTO ATTENDEE_ONBOARDING_RESPONSES t
        USING (SELECT :attendee_id AS ATTENDEE_ID, :question_id AS QUESTION_ID FROM DUAL) src
        ON (t.ATTENDEE_ID = src.ATTENDEE_ID AND t.QUESTION_ID = src.QUESTION_ID)
        WHEN NOT MATCHED THEN
            INSERT (ATTENDEE_ID, QUESTION_ID, RESPONSE)
            VALUES (:attendee_id, :question_id, :response)
        WHEN MATCHED THEN
            UPDATE SET RESPONSE = :response,
                       UPDATED_AT = CURRENT_TIMESTAMP
        RETURNING ID INTO :out_id
        """,
        params,
    )