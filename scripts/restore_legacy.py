#!/usr/bin/env python3
"""Restore legacy AIWorkshopAdmin tables from CSV exports under data/aiworkshop_admin.

Creates or truncates legacy tables (STUDENTS, ONBOARDING_TASKS, ONBOARDING_TASKS_BACKUP,
SURVEY_RESPONSES, WORKSHOP_FEEDBACK, LOCATIONS, DBTOOLS$MCP_LOG) and bulk loads rows
from the corresponding CSV files. Requires Oracle credentials via environment.
"""

from __future__ import annotations

import csv
import os
import sys
from dataclasses import dataclass
from pathlib import Path

import oracledb


ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.config import config as app_config  # noqa: E402


LEGACY_TABLES = {
    "STUDENTS": {
        "csv": "STUDENTS.csv",
        "columns": [
            "STUDENT_ID", "EMAIL_ADDRESS", "NAME", "LOCATION", "MANAGER", "JOB_ID",
            "INTRO", "TL1", "TL2", "TL3", "ACK", "ON_BOARDED", "TF", "TEAM",
            "FACE_IMAGE", "ONBOARDING_COMMENTS", "PLAYED_2T1L", "CREATED_AT", "UPDATED_AT",
            "MAC_PC", "TSHIRT_SIZE"
        ],
    },
    "ONBOARDING_TASKS": {
        "csv": "ONBOARDING_TASKS.csv",
        "columns": ["TASK_ID", "STUDENT_ID", "TASK_CODE", "COMPLETED", "COMPLETED_AT"],
    },
    "ONBOARDING_TASKS_BACKUP": {
        "csv": "ONBOARDING_TASKS_BACKUP.csv",
        "columns": ["TASK_ID", "STUDENT_ID", "TASK_CODE", "COMPLETED", "COMPLETED_AT"],
    },
    "SURVEY_RESPONSES": {
        "csv": "SURVEY_RESPONSES.csv",
        "columns": [
            "RESPONSE_ID", "STUDENT_ID", "SURVEY_TYPE", "RATING",
            "WHAT_LIKED", "WHAT_BETTER", "COMMENTS", "CREATED_AT"
        ],
    },
    "WORKSHOP_FEEDBACK": {
        "csv": "WORKSHOP_FEEDBACK.csv",
        "columns": [
            "FEEDBACK_ID", "STUDENT_ID", "OVERALL_RATING",
            "OVERALL_COMMENTS", "FUTURE_IDEAS", "CREATED_AT"
        ],
    },
    "LOCATIONS": {
        "csv": "LOCATIONS.csv",
        "columns": ["ID", "CODE", "NAME", "ROOM", "MEETING_TIME", "AGENDA_IMAGE_PATH"],
    },
    "DBTOOLS$MCP_LOG": {
        "csv": "DBTOOLS$MCP_LOG.csv",
        "columns": [
            "ID", "MCP_CLIENT", "MODEL", "END_POINT_TYPE", "END_POINT_NAME",
            "LOG_MESSAGE", "CREATED_ON", "CREATED_BY", "UPDATED_ON", "UPDATED_BY"
        ],
    },
}

DATA_DIR = ROOT_DIR / "data" / "aiworkshop_admin"


@dataclass
class OracleConfig:
    user: str
    password: str
    dsn: str
    wallet: str | None = None
    wallet_password: str | None = None


def load_config() -> OracleConfig:
    user = app_config.oracle_user
    password = app_config.oracle_password
    dsn = app_config.oracle_dsn

    if not all([user, password, dsn]):
        raise RuntimeError(
            "Oracle credentials are not fully configured. "
            "Set ORACLE_* env vars or update config.yaml before running restore."
        )

    return OracleConfig(
        user=user,
        password=password,
        dsn=dsn,
        wallet=app_config.oracle_wallet,
        wallet_password=app_config.oracle_wallet_pass,
    )


def get_connection(cfg: OracleConfig) -> oracledb.Connection:
    kwargs: dict[str, object] = {
        "user": cfg.user,
        "password": cfg.password,
        "dsn": cfg.dsn,
    }
    if cfg.wallet:
        kwargs["config_dir"] = cfg.wallet
        kwargs["wallet_location"] = cfg.wallet
    if cfg.wallet_password:
        kwargs["wallet_password"] = cfg.wallet_password
    return oracledb.connect(**kwargs)


def ensure_table(cursor: oracledb.Cursor, table: str, columns: list[str]) -> None:
    column_defs = ", ".join(f"{col} VARCHAR2(4000)" for col in columns)
    cursor.execute(
        f"""
        DECLARE
            l_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO l_count
            FROM user_tables WHERE table_name = :tbl;
            IF l_count = 0 THEN
                EXECUTE IMMEDIATE 'CREATE TABLE {table} ({column_defs})';
            END IF;
            EXECUTE IMMEDIATE 'TRUNCATE TABLE {table}';
        END;
        """,
        tbl=table,
    )


def restore_table(cursor: oracledb.Cursor, table: str, spec: dict) -> None:
    csv_path = DATA_DIR / spec["csv"]
    if not csv_path.exists():
        print(f"Skipping {table}: {csv_path} not found")
        return

    columns = spec["columns"]
    ensure_table(cursor, table, columns)

    with csv_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)

    if not rows:
        print(f"No rows found in {csv_path}; leaving {table} empty")
        return

    placeholders = ", ".join(f":{col}" for col in columns)
    insert_sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders})"

    cursor.executemany(insert_sql, rows)
    print(f"Loaded {len(rows)} rows into {table}")


def main() -> int:
    cfg = load_config()

    if not DATA_DIR.exists():
        print(f"Data directory {DATA_DIR} not found", file=sys.stderr)
        return 1

    with get_connection(cfg) as conn:
        with conn.cursor() as cursor:
            for table, spec in LEGACY_TABLES.items():
                try:
                    restore_table(cursor, table, spec)
                    conn.commit()
                except Exception as exc:  # noqa: BLE001
                    print(f"Failed to restore {table}: {exc}", file=sys.stderr)
                    conn.rollback()
                    return 1

    print("Legacy tables restored successfully.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as err:  # noqa: BLE001
        print(f"Restore failed: {err}", file=sys.stderr)
        sys.exit(1)
