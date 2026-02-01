#!/usr/bin/env python
"""Export all tables from the AIWorkshopAdmin schema to CSV files."""

import csv
import os
import sys
from dataclasses import dataclass

import oracledb


@dataclass
class OracleConfig:
    user: str
    password: str
    dsn: str
    wallet: str | None = None
    wallet_password: str | None = None


def load_config() -> OracleConfig:
    """Load Oracle connection configuration from environment variables."""
    missing = []
    user = os.getenv("ORACLE_USER")
    if not user:
        missing.append("ORACLE_USER")

    password = os.getenv("ORACLE_PASSWORD")
    if not password:
        missing.append("ORACLE_PASSWORD")

    dsn = os.getenv("ORACLE_DSN")
    if not dsn:
        missing.append("ORACLE_DSN")

    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

    wallet = os.getenv("ORACLE_WALLET")
    wallet_password = os.getenv("ORACLE_WALLET_PASS")

    return OracleConfig(
        user=str(user),
        password=str(password),
        dsn=str(dsn),
        wallet=wallet if wallet else None,
        wallet_password=wallet_password if wallet_password else None,
    )


def get_connection(cfg: OracleConfig) -> oracledb.Connection:
    """Establish and return a connection using the given configuration."""
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


def export_table(cursor: oracledb.Cursor, table_name: str, output_dir: str) -> str:
    """Export a single table to CSV and return the output file path."""
    cursor.execute(f"SELECT * FROM {table_name}")
    columns = [col[0] for col in cursor.description]

    output_path = os.path.join(output_dir, f"{table_name}.csv")
    with open(output_path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(columns)
        for row in cursor:
            writer.writerow(row)

    return output_path


def main():
    cfg = load_config()
    output_dir = os.path.join(
        os.getcwd(), "data", "aiworkshop_admin"
    )
    os.makedirs(output_dir, exist_ok=True)

    tables = [
        "STUDENTS",
        "STUDENTS_BACKUP",
        "ONBOARDING_TASKS",
        "ONBOARDING_TASKS_BACKUP",
        "SURVEY_RESPONSES",
        "WORKSHOP_FEEDBACK",
        "LOCATIONS",
        "DBTOOLS$MCP_LOG",
    ]

    try:
        with get_connection(cfg) as connection:
            with connection.cursor() as cursor:
                for table in tables:
                    try:
                        csv_path = export_table(cursor, table, output_dir)
                        print(f"Exported {table} -> {csv_path}")
                    except Exception as table_err:  # noqa: BLE001
                        print(f"Failed to export {table}: {table_err}", file=sys.stderr)
    except Exception as err:  # noqa: BLE001
        print(f"Export failed: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
