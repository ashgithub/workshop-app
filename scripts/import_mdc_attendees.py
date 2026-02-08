"""Import MDC cohort attendees from CSV into the Oracle database."""

from __future__ import annotations

import csv
from pathlib import Path

from backend.database import db

CSV_PATH = Path("data/mdc_attendees.csv")
COHORT_CODE = "MDC2026"
TEAM_NAME_CODE = "team_name"


def load_intro_question_ids() -> dict[str, int]:
    rows = db.execute_query(
        "SELECT CODE, ID FROM INTRO_QUESTIONS WHERE ACTIVE = 'Y'",
    )
    return {code: qid for code, qid in rows or []}


def get_cohort_id() -> int:
    row = db.fetch_one(
        "SELECT ID FROM COHORTS WHERE COHORT_CODE = :code",
        {"code": COHORT_CODE},
    )
    if not row:
        raise RuntimeError(f"Cohort {COHORT_CODE} not found; run seed_defaults() first")
    return row[0]


def import_attendees() -> None:
    cohort_id = get_cohort_id()
    intro_map = load_intro_question_ids()
    team_question_id = intro_map.get(TEAM_NAME_CODE)

    with CSV_PATH.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            email = row["email"].strip()
            name = row.get("name", "").strip() or None
            title = row.get("title", "").strip() or None
            manager = row.get("team_manager", "").strip() or None
            image_filename = row.get("image_filename", "").strip() or "default-avatar.svg"
            profile_image = f"static/images/mdc/{image_filename}"

            attendee_id = db.execute_returning(
                """
                MERGE INTO ATTENDEES t
                USING (
                    SELECT :cohort_id AS COHORT_ID,
                           :email AS EMAIL
                    FROM DUAL
                ) src
                ON (t.COHORT_ID = src.COHORT_ID AND t.EMAIL = src.EMAIL)
                WHEN MATCHED THEN
                    UPDATE SET FULL_NAME = :full_name,
                               TITLE = :title,
                               MANAGER = :manager,
                               PROFILE_IMAGE = :profile_image,
                               IS_TEST = 'N',
                               UPDATED_AT = CURRENT_TIMESTAMP
                WHEN NOT MATCHED THEN
                    INSERT (COHORT_ID, EMAIL, FULL_NAME, TITLE, MANAGER, PROFILE_IMAGE, IS_TEST)
                    VALUES (:cohort_id, :email, :full_name, :title, :manager, :profile_image, 'N')
                RETURNING ID INTO :out_id
                """,
                {
                    "cohort_id": cohort_id,
                    "email": email,
                    "full_name": name,
                    "title": title,
                    "manager": manager,
                    "profile_image": profile_image,
                },
            )

            team_name = row.get("team", "").strip()
            if team_question_id and team_name:
                db.execute_dml(
                    """
                    MERGE INTO ATTENDEE_INTRO_RESPONSES t
                    USING (
                        SELECT :attendee_id AS ATTENDEE_ID,
                               :question_id AS QUESTION_ID
                        FROM DUAL
                    ) src
                    ON (t.ATTENDEE_ID = src.ATTENDEE_ID AND t.QUESTION_ID = src.QUESTION_ID)
                    WHEN MATCHED THEN
                        UPDATE SET RESPONSE = :response,
                                   UPDATED_AT = CURRENT_TIMESTAMP
                    WHEN NOT MATCHED THEN
                        INSERT (ATTENDEE_ID, QUESTION_ID, RESPONSE)
                        VALUES (:attendee_id, :question_id, :response)
                    """,
                    {
                        "attendee_id": attendee_id,
                        "question_id": team_question_id,
                        "response": team_name,
                    },
                )


if __name__ == "__main__":
    import_attendees()
    print("✓ MDC attendee import completed")