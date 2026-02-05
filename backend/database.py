"""
Database connection and schema management for the Oracle-backed workshop survey system.
"""
from __future__ import annotations

import logging
import sys
import traceback
from contextlib import contextmanager
from typing import Generator, Optional

import oracledb

from .config import config

logger = logging.getLogger(__name__)


class DatabaseConnection:
    """Manages Oracle connection pooling, DDL, and helpers."""

    def __init__(self) -> None:
        self.pool: Optional[oracledb.ConnectionPool] = None
        self._init_pool()

    def _init_pool(self) -> None:
        print(f"DEBUG: Attempting Oracle connection with:")
        print(f"  User: {config.oracle_user}")
        print(f"  DSN: {config.oracle_dsn}")
        print(f"  Wallet: {config.oracle_wallet}")

        try:
            if not all([config.oracle_user, config.oracle_password, config.oracle_dsn]):
                logger.warning("Oracle credentials not fully configured; database operations disabled")
                self.pool = None
                return

            self.pool = oracledb.create_pool(
                user=config.oracle_user,
                password=config.oracle_password,
                dsn=config.oracle_dsn,
                config_dir=config.oracle_wallet,
                wallet_location=config.oracle_wallet,
                wallet_password=config.oracle_wallet_pass,
                min=2,
                max=20,
                increment=1,
                getmode=oracledb.POOL_GETMODE_WAIT,
                timeout=30,
            )
            print("DEBUG: Pool creation successful")
            logger.info("Oracle connection pool initialized")
        except Exception as exc:  # pragma: no cover - requires Oracle runtime
            error_msg = f"Failed to initialize Oracle pool: {exc}"
            print(f"ERROR: {error_msg}", file=sys.stderr)
            logger.error(error_msg)
            logger.error("Full traceback: %s", traceback.format_exc())
            self.pool = None

    @contextmanager
    def get_connection(self) -> Generator[oracledb.Connection, None, None]:
        if self.pool is None:
            raise RuntimeError("Oracle connection pool not initialized")

        connection = self.pool.acquire()
        try:
            yield connection
        finally:
            self.pool.release(connection)

    def execute_query(self, query: str, params: Optional[dict | tuple] = None, fetch: bool = True):
        with self.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, params or {})
                return cursor.fetchall() if fetch else None

    def execute_dml(self, query: str, params: Optional[dict | tuple] = None) -> int:
        with self.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, params or {})
                conn.commit()
                return cursor.rowcount

    def fetch_one(self, query: str, params: Optional[dict | tuple] = None):
        rows = self.execute_query(query, params)
        return rows[0] if rows else None

    def execute_returning(self, query: str, params: dict, out_name: str = "out_id"):
        with self.get_connection() as conn:
            with conn.cursor() as cursor:
                bind = params.copy() if params else {}
                out_var = cursor.var(oracledb.NUMBER)
                bind[out_name] = out_var
                cursor.execute(query, bind)
                conn.commit()
                value = out_var.getvalue()
                if isinstance(value, list):
                    return value[0]
                return value

    def _safe_execute(self, statement: str) -> None:
        try:
            self.execute_dml(statement)
        except Exception as exc:
            error_code = getattr(exc, "errorcode", None)
            if error_code == 942:  # ORA-00942 table or view does not exist
                logger.debug("Table does not exist, skipping drop: %s", statement)
                return
            logger.warning("DDL statement failed (error %s): %s", error_code, statement)
            raise

    def rebuild_schema(self) -> None:
        drop_statements = [
            # "DROP TABLE NL_QUERY_LOGS CASCADE CONSTRAINTS",  # Disabled NL_QUERY functionality
            "DROP TABLE SURVEY_ANSWERS CASCADE CONSTRAINTS",
            "DROP TABLE SURVEY_SUBMISSIONS CASCADE CONSTRAINTS",
            "DROP TABLE SURVEY_QUESTIONS CASCADE CONSTRAINTS",
            "DROP TABLE SURVEY_TEMPLATES CASCADE CONSTRAINTS",
            "DROP TABLE GAME_LOGS CASCADE CONSTRAINTS",
            "DROP TABLE ATTENDEES CASCADE CONSTRAINTS",
            "DROP TABLE ADMIN_USERS CASCADE CONSTRAINTS",
            "DROP TABLE COHORTS CASCADE CONSTRAINTS",
            "DROP TABLE INTRO_QUESTIONS CASCADE CONSTRAINTS",
            "DROP TABLE ONBOARDING_QUESTIONS CASCADE CONSTRAINTS",
            "DROP TABLE ATTENDEE_INTRO_RESPONSES CASCADE CONSTRAINTS",
            "DROP TABLE ATTENDEE_ONBOARDING_RESPONSES CASCADE CONSTRAINTS",
        ]

        for stmt in drop_statements:
            table_name = stmt.replace("DROP TABLE ", "").replace(" CASCADE CONSTRAINTS", "").strip()
            print(f"Dropping table: {table_name}")
            try:
                self._safe_execute(stmt)
                print(f"✓ Dropped table: {table_name}")
            except Exception as exc:
                logger.warning("Failed to drop object: %s", exc)
                print(f"✗ Failed to drop table: {table_name}")

        create_statements = [
            """
            CREATE TABLE ADMIN_USERS (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                EMAIL VARCHAR2(255) UNIQUE NOT NULL,
                FULL_NAME VARCHAR2(255) NOT NULL,
                IS_ACTIVE CHAR(1) DEFAULT 'Y' CHECK (IS_ACTIVE IN ('Y','N')),
                IS_TEST CHAR(1) DEFAULT 'N' CHECK (IS_TEST IN ('Y','N')),
                CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE COHORTS (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                COHORT_CODE VARCHAR2(30) UNIQUE NOT NULL,
                TITLE VARCHAR2(255) NOT NULL,
                LOCATION_NAME VARCHAR2(255) NOT NULL,
                ADDRESS VARCHAR2(500),
                ROOM VARCHAR2(120),
                START_DATE DATE,
                END_DATE DATE,
                START_TIME TIMESTAMP,
                END_TIME TIMESTAMP,
                AGENDA_URL VARCHAR2(500),
                CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE ATTENDEES (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                COHORT_ID NUMBER NOT NULL REFERENCES COHORTS(ID) ON DELETE CASCADE,
                EMAIL VARCHAR2(255) NOT NULL,
                FULL_NAME VARCHAR2(255),
                PROFILE_IMAGE VARCHAR2(500),
                IS_TEST CHAR(1) DEFAULT 'N' CHECK (IS_TEST IN ('Y','N')),
                ACKNOWLEDGED CHAR(1) DEFAULT 'N' CHECK (ACKNOWLEDGED IN ('Y','N')),
                CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (COHORT_ID, EMAIL)
            )
            """,

            """
            CREATE TABLE INTRO_QUESTIONS (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                CODE VARCHAR2(50) UNIQUE NOT NULL,
                PROMPT VARCHAR2(500) NOT NULL,
                DISPLAY_ORDER NUMBER DEFAULT 0,
                REQUIRED CHAR(1) DEFAULT 'Y' CHECK (REQUIRED IN ('Y','N')),
                ACTIVE CHAR(1) DEFAULT 'Y' CHECK (ACTIVE IN ('Y','N')),
                QUESTION_TYPE VARCHAR2(30) DEFAULT 'text' NOT NULL,
                CONFIG CLOB,
                HELP_TEXT VARCHAR2(1000),
                CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE ONBOARDING_QUESTIONS (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                CODE VARCHAR2(50) UNIQUE NOT NULL,
                PROMPT VARCHAR2(500) NOT NULL,
                DISPLAY_ORDER NUMBER DEFAULT 0,
                REQUIRED CHAR(1) DEFAULT 'Y' CHECK (REQUIRED IN ('Y','N')),
                ACTIVE CHAR(1) DEFAULT 'Y' CHECK (ACTIVE IN ('Y','N')),
                QUESTION_TYPE VARCHAR2(30) DEFAULT 'text' NOT NULL,
                CONFIG CLOB,
                HELP_TEXT VARCHAR2(1000),
                CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE ATTENDEE_INTRO_RESPONSES (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                ATTENDEE_ID NUMBER NOT NULL REFERENCES ATTENDEES(ID) ON DELETE CASCADE,
                QUESTION_ID NUMBER NOT NULL REFERENCES INTRO_QUESTIONS(ID) ON DELETE CASCADE,
                RESPONSE CLOB,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (ATTENDEE_ID, QUESTION_ID)
            )
            """,
            """
            CREATE TABLE ATTENDEE_ONBOARDING_RESPONSES (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                ATTENDEE_ID NUMBER NOT NULL REFERENCES ATTENDEES(ID) ON DELETE CASCADE,
                QUESTION_ID NUMBER NOT NULL REFERENCES ONBOARDING_QUESTIONS(ID) ON DELETE CASCADE,
                RESPONSE CLOB,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (ATTENDEE_ID, QUESTION_ID)
            )
            """,
            """
            CREATE TABLE SURVEY_TEMPLATES (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                NAME VARCHAR2(255) NOT NULL,
                SLUG VARCHAR2(60) UNIQUE NOT NULL,
                DESCRIPTION VARCHAR2(1000),
                DISPLAY_ORDER NUMBER DEFAULT 0,
                ACTIVE CHAR(1) DEFAULT 'Y' CHECK (ACTIVE IN ('Y','N')),
                CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE SURVEY_QUESTIONS (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                TEMPLATE_ID NUMBER NOT NULL REFERENCES SURVEY_TEMPLATES(ID) ON DELETE CASCADE,
                PROMPT VARCHAR2(1000) NOT NULL,
                QUESTION_TYPE VARCHAR2(30) NOT NULL,
                OPTIONS CLOB,
                DISPLAY_ORDER NUMBER DEFAULT 0,
                REQUIRED CHAR(1) DEFAULT 'Y' CHECK (REQUIRED IN ('Y','N'))
            )
            """,
            """
            CREATE TABLE SURVEY_SUBMISSIONS (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                ATTENDEE_ID NUMBER NOT NULL REFERENCES ATTENDEES(ID) ON DELETE CASCADE,
                TEMPLATE_ID NUMBER NOT NULL REFERENCES SURVEY_TEMPLATES(ID) ON DELETE CASCADE,
                SUBMITTED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (ATTENDEE_ID, TEMPLATE_ID)
            )
            """,
            """
            CREATE TABLE SURVEY_ANSWERS (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                SUBMISSION_ID NUMBER NOT NULL REFERENCES SURVEY_SUBMISSIONS(ID) ON DELETE CASCADE,
                QUESTION_ID NUMBER NOT NULL REFERENCES SURVEY_QUESTIONS(ID) ON DELETE CASCADE,
                RESPONSE CLOB
            )
            """,
            """
            CREATE TABLE GAME_LOGS (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                ATTENDEE_ID NUMBER REFERENCES ATTENDEES(ID) ON DELETE CASCADE,
                STATUS VARCHAR2(20) DEFAULT 'PENDING',
                REVEALED_LIE NUMBER,
                TIMESTAMP TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            # NL_QUERY_LOGS table disabled - natural language query functionality disabled
            # """
            # CREATE TABLE NL_QUERY_LOGS (
            #     ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            #     ADMIN_ID NUMBER REFERENCES ADMIN_USERS(ID) ON DELETE SET NULL,
            #     PROMPT CLOB NOT NULL,
            #     GENERATED_SQL CLOB,
            #     ROW_COUNT NUMBER,
            #     LATENCY_MS NUMBER,
            #     CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            # )
            # """,
        ]

        for i, stmt in enumerate(create_statements, 1):
            # Extract table name from CREATE TABLE statement
            lines = [line.strip() for line in stmt.strip().split('\n') if line.strip()]
            table_name = "UNKNOWN"
            if lines and lines[0].startswith("CREATE TABLE"):
                table_name = lines[0].split()[2].strip('(').upper()
            elif lines and "CREATE TABLE" in lines[0]:
                # Handle multi-line case
                for line in lines:
                    if "CREATE TABLE" in line:
                        parts = line.split()
                        if len(parts) >= 3:
                            table_name = parts[2].strip('(').upper()
                        break

            print(f"Creating table: {table_name}")
            try:
                self.execute_dml(stmt)
                print(f"✓ Created table: {table_name}")
            except Exception as exc:
                print(f"✗ Failed to create table: {table_name} - Error: {exc}")
                logger.error(f"Failed to create table {table_name}: {exc}")
                raise

        logger.info("Oracle schema rebuilt for 2026 workshop")

    def seed_defaults(self) -> None:
        print("Seeding default data...")

        print("Seeding admin users...")
        try:
            self.execute_dml(
                """
                MERGE INTO ADMIN_USERS t
                USING (SELECT :email AS EMAIL FROM DUAL) src
                ON (t.EMAIL = src.EMAIL)
                WHEN NOT MATCHED THEN
                    INSERT (EMAIL, FULL_NAME)
                    VALUES (:email, :full_name)
                """,
                {"email": "ashish.ag.agarwal@oracle.com", "full_name": "Primary Admin"},
            )
            print("✓ Admin users seeded")
        except Exception as exc:
            print(f"✗ Failed to seed admin users: {exc}")
            raise

        print("Seeding cohorts...")
        try:
            self.execute_dml(
                """
                MERGE INTO COHORTS t
                USING (SELECT :code AS COHORT_CODE FROM DUAL) src
                ON (t.COHORT_CODE = src.COHORT_CODE)
                WHEN NOT MATCHED THEN
                    INSERT (COHORT_CODE, TITLE, LOCATION_NAME, ADDRESS, ROOM, START_DATE, END_DATE, START_TIME, END_TIME, AGENDA_URL)
                    VALUES (
                        :code,
                        :title,
                        :location,
                        :address,
                        :room,
                        TO_DATE(:start_dt, 'YYYY-MM-DD'),
                        TO_DATE(:end_dt, 'YYYY-MM-DD'),
                        TO_TIMESTAMP(:start_time, 'YYYY-MM-DD HH24:MI'),
                        TO_TIMESTAMP(:end_time, 'YYYY-MM-DD HH24:MI'),
                        :agenda
                    )
                """,
                {
                    "code": "MDC2026",
                    "title": "MDC March 2026 Cohort",
                    "location": "MDC",
                    "address": "P.º Valle Real 1275, Valle Real, 45019 Zapopan, Jal., Mexico",
                    "room": "TBD",
                    "start_dt": "2026-03-23",
                    "end_dt": "2026-03-27",
                    "start_time": "2026-03-23 09:00",
                    "end_time": "2026-03-23 17:00",
                    "agenda": "images/agenda-mdc.png",
                },
            )
            print("✓ Cohorts seeded")
        except Exception as exc:
            print(f"✗ Failed to seed cohorts: {exc}")
            raise



        # Seed survey templates and questions
        self.seed_survey_questions()

        intro_questions = [
            {
                "code": "team_name",
                "prompt": "Team name",
                "order": 1,
                "required": "Y",
                "question_type": "text",
                "config": None,
                "help_text": "Enter your team name",
            },
            {
                "code": "intro",
                "prompt": "Tell us about yourself.",
                "order": 2,
                "required": "Y",
                "question_type": "textarea",
                "config": None,
                "help_text": "Tell us about your experience with Oracle, OCI Services, Gen AI services, Python. Mention and AI certifications. Also descibe or use of AI for productivity vs developing AI features in products",
            },
            {
                "code": "truth_1",
                "prompt": "Two truths and a lie — entry 1",
                "order": 3,
                "required": "Y",
                "question_type": "text",
                "config": None,
                "help_text": "One of the two truths or a lie",
            },
            {
                "code": "truth_2",
                "prompt": "Two truths and a lie — entry 2",
                "order": 4,
                "required": "Y",
                "question_type": "text",
                "config": None,
                "help_text": "One of the two truths or a lie",
            },
            {
                "code": "truth_3",
                "prompt": "Two truths and a lie — entry 3",
                "order": 5,
                "required": "Y",
                "question_type": "text",
                "config": None,
                "help_text": "One of the two truths or a lie",
            },
            {
                "code": "device_pref",
                "prompt": "Which device will you bring?",
                "order": 6,
                "required": "Y",
                "question_type": "choice",
                "config": '{"options":[{"value":"M","label":"Mac"},{"value":"P","label":"PC"}]}',
                "help_text": None,
            },
            {
                "code": "tshirt_size",
                "prompt": "Preferred T-shirt size",
                "order": 7,
                "required": "Y",
                "question_type": "choice",
                "config": '{"options":[{"value":"S","label":"Small"},{"value":"M","label":"Medium"},{"value":"L","label":"Large"},{"value":"XL","label":"Extra Large"}]}',
                "help_text": None,
            },
        ]

        for question in intro_questions:
            self.execute_dml(
                """
                MERGE INTO INTRO_QUESTIONS t
                USING (SELECT :code AS CODE FROM DUAL) src
                ON (t.CODE = src.CODE)
                WHEN NOT MATCHED THEN
                    INSERT (CODE, PROMPT, DISPLAY_ORDER, REQUIRED, QUESTION_TYPE, CONFIG, HELP_TEXT)
                    VALUES (:code, :prompt, :display_order, :required, :question_type, :config, :help_text)
        WHEN MATCHED THEN
            UPDATE SET PROMPT = :prompt,
               DISPLAY_ORDER = :display_order,
               REQUIRED = :required,
               QUESTION_TYPE = :question_type,
               CONFIG = :config,
               HELP_TEXT = :help_text,
               ACTIVE = 'Y',
               UPDATED_AT = CURRENT_TIMESTAMP
                """,
                {
                    "code": question["code"],
                    "prompt": question["prompt"],
                    "display_order": question["order"],
                    "required": question["required"],
                    "question_type": question["question_type"],
                    "config": question["config"],
                    "help_text": question["help_text"],
                },
            )

        question_rows = self.execute_query(
            "SELECT CODE, ID FROM INTRO_QUESTIONS WHERE ACTIVE = 'Y'",
        ) or []
        question_map = {code: qid for code, qid in question_rows}

        intro_seed = {
            "test1@test.org": {
                "team_name": "Redwood Rockets",
                "intro": "I lead the Redwood UI workstream and mentor new attendees.",
                "truth_1": "I speak four languages.",
                "truth_2": "I can't ride a bike.",
                "truth_3": "I design board games.",
                "device_pref": "M",
            },
            "test2@test.org": {
                "team_name": "Travel Titans",
                "intro": "I coordinate travel logistics and on-site experiences.",
                "truth_1": "I've met three astronauts.",
                "truth_2": "I hate coffee.",
                "truth_3": "I code during flights.",
                "device_pref": "P",
            },
            "test3@test.org": {
                "team_name": "AI All-Stars",
                "intro": "I run daily AI lab sessions for MDC cohorts.",
                "truth_1": "I paint abstract art.",
                "truth_2": "I have a twin.",
                "truth_3": "I'm terrified of heights.",
                "device_pref": "M",
                "tshirt_size": "L",
            },
        }

        for email, responses in intro_seed.items():
            attendee_row = self.fetch_one(
                "SELECT ID FROM ATTENDEES WHERE UPPER(EMAIL) = UPPER(:email)",
                {"email": email},
            )
            if not attendee_row:
                continue
            attendee_id = attendee_row[0]

            for code, response in responses.items():
                question_id = question_map.get(code)
                if not question_id:
                    continue
                self.execute_dml(
                    """
                    MERGE INTO ATTENDEE_INTRO_RESPONSES t
                    USING (SELECT :attendee_id AS ATTENDEE_ID, :question_id AS QUESTION_ID FROM DUAL) src
                    ON (t.ATTENDEE_ID = src.ATTENDEE_ID AND t.QUESTION_ID = src.QUESTION_ID)
                    WHEN NOT MATCHED THEN
                        INSERT (ATTENDEE_ID, QUESTION_ID, RESPONSE)
                        VALUES (:attendee_id, :question_id, :response)
                    WHEN MATCHED THEN
                        UPDATE SET RESPONSE = :response,
                                   UPDATED_AT = CURRENT_TIMESTAMP
                    """,
                    {
                        "attendee_id": attendee_id,
                        "question_id": question_id,
                        "response": response,
                    },
                )

        # Seed onboarding questions
        onboarding_questions = [
            {
                "code": "ai_sandbox",
                "prompt": "Do you have  access to AI Sandbox? (Step 3 on canvas)",
                "order": 1,
                "required": "Y",
                "question_type": "choice",
                "config": '{"options":[{"value":"Y","label":"Yes"},{"value":"N","label":"No"}]}',
                "help_text": None,
            },
            {
                "code": "install_tools",
                "prompt": "Have you installed required tools ?(step 4 on canvas)",
                "order": 2,
                "required": "Y",
                "question_type": "choice",
                "config": '{"options":[{"value":"Y","label":"Yes"},{"value":"N","label":"No"}]}',
                "help_text": None,
            },
            {
                "code": "sample_code",
                "prompt": "Do you have sample code setup and configued your .env file (Step 5 on canvas)",
                "order": 3,
                "required": "Y",
                "question_type": "choice",
                "config": '{"options":[{"value":"Y","label":"Yes"},{"value":"N","label":"No"}]}',
                "help_text": None,
            },
            {
                "code": "install_cline",
                "prompt": "Have you installed Cline?",
                "order": 4,
                "required": "Y",
                "question_type": "choice",
                "config": '{"options":[{"value":"Y","label":"Yes"},{"value":"N","label":"No"}]}',
                "help_text": None,
            },
            {
                "code": "run_code",
                "prompt": "Have you run the code to verify setup?",
                "order": 5,
                "required": "Y",
                "question_type": "choice",
                "config": '{"options":[{"value":"Y","label":"Yes"},{"value":"N","label":"No"}]}',
                "help_text": None,
            },
            {
                "code": "run_tools",
                "prompt": "are you able to access the sandboc databse?",
                "order": 6,
                "required": "Y",
                "question_type": "choice",
                "config": '{"options":[{"value":"Y","label":"Yes"},{"value":"N","label":"No"}]}',
                "help_text": None,
            },
            {
                "code": "tool_setip",
                "prompt": "do you have your sqlcl mcp server setup",
                "order": 7,
                "required": "Y",
                "question_type": "choice",
                "config": '{"options":[{"value":"Y","label":"Yes"},{"value":"N","label":"No"}]}',
                "help_text": None,
            },
        ]

        for question in onboarding_questions:
            self.execute_dml(
                """
                MERGE INTO ONBOARDING_QUESTIONS t
                USING (SELECT :code AS CODE FROM DUAL) src
                ON (t.CODE = src.CODE)
                WHEN NOT MATCHED THEN
                    INSERT (CODE, PROMPT, DISPLAY_ORDER, REQUIRED, QUESTION_TYPE, CONFIG, HELP_TEXT)
                    VALUES (:code, :prompt, :display_order, :required, :question_type, :config, :help_text)
                WHEN MATCHED THEN
                    UPDATE SET PROMPT = :prompt,
                               DISPLAY_ORDER = :display_order,
                               REQUIRED = :required,
                               QUESTION_TYPE = :question_type,
                               CONFIG = :config,
                               HELP_TEXT = :help_text,
                               ACTIVE = 'Y',
                               UPDATED_AT = CURRENT_TIMESTAMP
                """,
                {
                    "code": question["code"],
                    "prompt": question["prompt"],
                    "display_order": question["order"],
                    "required": question["required"],
                    "question_type": question["question_type"],
                    "config": question["config"],
                    "help_text": question["help_text"],
                },
            )

        # Seed test attendees
        print("Seeding test attendees...")
        try:
            cohort_row = self.execute_query("SELECT ID FROM COHORTS WHERE COHORT_CODE = :code", {"code": "MDC2026"})
            cohort_id = None
            if cohort_row:
                cohort_id = cohort_row[0][0]

                test_attendees = [
                    {
                        "email": "test1@test.org",
                        "full_name": "Jordan Rivera",
                        "profile_image": "static/images/default-avatar.svg",
                    },
                    {
                        "email": "test2@test.org",
                        "full_name": "Casey Morgan",
                        "profile_image": "static/images/cdefault-avatar.svg",
                    },
                    {
                        "email": "test3@test.org",
                        "full_name": "Taylor Quinn",
                        "profile_image": "static/images/default-avatar.svg",
                    },
                ]

                for attendee in test_attendees:
                    attendee_id = self.execute_returning(
                        """
                        INSERT INTO ATTENDEES (COHORT_ID, EMAIL, FULL_NAME, PROFILE_IMAGE, IS_TEST)
                        VALUES (:cohort_id, :email, :full_name, :profile_image, 'Y')
                        RETURNING ID INTO :out_id
                        """,
                        {
                            "cohort_id": cohort_id,
                            "email": attendee["email"],
                            "full_name": attendee["full_name"],
                            "profile_image": attendee.get("profile_image"),
                        },
                    )

                    # Seed survey submissions for test attendees
                    survey_templates = self.execute_query("SELECT ID FROM SURVEY_TEMPLATES")
                    if survey_templates:
                        for template_row in survey_templates:
                            template_id = template_row[0]
                            try:
                                self.execute_dml(
                                    """
                                    INSERT INTO SURVEY_SUBMISSIONS (ATTENDEE_ID, TEMPLATE_ID)
                                    VALUES (:attendee_id, :template_id)
                                    """,
                                    {
                                        "attendee_id": attendee_id,
                                        "template_id": template_id,
                                    },
                                )
                            except Exception:
                                # Ignore duplicate submissions
                                pass

            print("✓ Test attendees seeded")
        except Exception as exc:
            print(f"✗ Failed to seed test attendees: {exc}")
            raise

        logger.info("Seed data inserted for MDC cohort")

    def seed_survey_templates(self):
        templates = [
            ("Onboarding Survey", "onboarding", "Pre-workshop feedback and setup check", "Y"),
            ("Day 1 Feedback", "day1", "Workshop Day 1 survey", "Y"),
            ("Day 2 Feedback", "day2", "Workshop Day 2 survey", "Y"),
            ("Overall Survey", "overall", "Post-workshop wrap-up survey", "Y"),
        ]
        for name, slug, desc, active in templates:
            existing = self.fetch_one("SELECT ID FROM SURVEY_TEMPLATES WHERE SLUG = :slug", {"slug": slug})
            if not existing:
                self.execute_dml("""
                    INSERT INTO SURVEY_TEMPLATES (NAME, SLUG, DESCRIPTION, ACTIVE)
                    VALUES (:name, :slug, :description, :active)
                """, {"name": name, "slug": slug, "description": desc, "active": active})

    def seed_survey_questions(self):
        print("Seeding survey templates and questions...")
        try:
            # Create all 7 survey templates (onboarding first, then day1-5, then overall)
            templates = [
                ("Onboarding Survey", "onboarding", "Pre-workshop onboarding and preparation", 1, "Y"),
                ("Day 1 Feedback", "day1", "Monday: LLM Promot Engineering", 2, "Y"),
                ("Day 2 Feedback", "day2", "Tuesday: Retrieval-Augmented Generation (RAG)", 3, "Y"),
                ("Day 3 Feedback", "day3", "Wednesday: Functions & Tool calling", 4, "Y"),
                ("Day 4 Feedback", "day4", "Thursday: Agents", 5, "Y"),
                ("Day 5 Feedback", "day5", "Friday: Dev Productivity", 6, "Y"),
                ("Overall Survey", "overall", "Overall workshop reflection", 7, "Y"),
            ]

            template_ids = {}
            for name, slug, desc, display_order, active in templates:
                existing = self.fetch_one("SELECT ID FROM SURVEY_TEMPLATES WHERE SLUG = :slug", {"slug": slug})
                if not existing:
                    template_id = self.execute_returning("""
                        INSERT INTO SURVEY_TEMPLATES (NAME, SLUG, DESCRIPTION, DISPLAY_ORDER, ACTIVE)
                        VALUES (:name, :slug, :description, :display_order, :active)
                        RETURNING ID INTO :out_id
                    """, {"name": name, "slug": slug, "description": desc, "display_order": display_order, "active": active})
                    template_ids[slug] = template_id
                else:
                    # Update existing record with display_order if it's missing
                    template_ids[slug] = existing[0]
                    self.execute_dml("""
                        UPDATE SURVEY_TEMPLATES
                        SET DISPLAY_ORDER = :display_order
                        WHERE ID = :id AND DISPLAY_ORDER IS NULL
                    """, {"display_order": display_order, "id": existing[0]})

            # Define questions for each survey
            survey_questions = {
                "onboarding": [
                    ("How excited are you for the workshop?", "choice", '{"options":[{"value":"5","label":"Very Excited"},{"value":"4","label":"Excited"},{"value":"3","label":"Neutral"},{"value":"2","label":"Not Very Excited"},{"value":"1","label":"Not Excited"}]}', 1, "Y"),
                    ("What do you hope to learn?", "textarea", None, 2, "Y"),
                    ("Any specific topics you're interested in?", "text", None, 3, "N"),
                ],
                "day1": [
                    ("How would you rate today's session on LLMs & RAG?", "choice", '{"options":[{"value":"5","label":"Excellent"},{"value":"4","label":"Very Good"},{"value":"3","label":"Good"},{"value":"2","label":"Fair"},{"value":"1","label":"Poor"}]}', 1, "Y"),
                    ("What was your biggest takeaway from today?", "textarea", None, 2, "Y"),
                    ("What would you like to explore more?", "text", None, 3, "N"),
                    ("Any challenges with the content?", "text", None, 4, "N"),
                ],
                "day2": [
                    ("How would you rate today's session on Function Calling & Agents?", "choice", '{"options":[{"value":"5","label":"Excellent"},{"value":"4","label":"Very Good"},{"value":"3","label":"Good"},{"value":"2","label":"Fair"},{"value":"1","label":"Poor"}]}', 1, "Y"),
                    ("What was your biggest takeaway from today?", "textarea", None, 2, "Y"),
                    ("What would you like to explore more?", "text", None, 3, "N"),
                    ("Any challenges with the content?", "text", None, 4, "N"),
                ],
                "day3": [
                    ("How would you rate today's session on Database & Speech?", "choice", '{"options":[{"value":"5","label":"Excellent"},{"value":"4","label":"Very Good"},{"value":"3","label":"Good"},{"value":"2","label":"Fair"},{"value":"1","label":"Poor"}]}', 1, "Y"),
                    ("What was your biggest takeaway from today?", "textarea", None, 2, "Y"),
                    ("What would you like to explore more?", "text", None, 3, "N"),
                    ("Any challenges with the content?", "text", None, 4, "N"),
                ],
                "day4": [
                    ("How would you rate today's session on Vision & Demos?", "choice", '{"options":[{"value":"5","label":"Excellent"},{"value":"4","label":"Very Good"},{"value":"3","label":"Good"},{"value":"2","label":"Fair"},{"value":"1","label":"Poor"}]}', 1, "Y"),
                    ("What was your biggest takeaway from today?", "textarea", None, 2, "Y"),
                    ("What would you like to explore more?", "text", None, 3, "N"),
                    ("Any challenges with the content?", "text", None, 4, "N"),
                ],
                "day5": [
                    ("How would you rate today's session on Dev Productivity?", "choice", '{"options":[{"value":"5","label":"Excellent"},{"value":"4","label":"Very Good"},{"value":"3","label":"Good"},{"value":"2","label":"Fair"},{"value":"1","label":"Poor"}]}', 1, "Y"),
                    ("What was your biggest takeaway from today?", "textarea", None, 2, "Y"),
                    ("What would you like to explore more?", "text", None, 3, "N"),
                    ("Any challenges with the content?", "text", None, 4, "N"),
                ],
                "overall": [
                    ("Overall, how would you rate the workshop?", "choice", '{"options":[{"value":"5","label":"Excellent"},{"value":"4","label":"Very Good"},{"value":"3","label":"Good"},{"value":"2","label":"Fair"},{"value":"1","label":"Poor"}]}', 1, "Y"),
                    ("What was the highlight of the week for you?", "textarea", None, 2, "Y"),
                    ("How has this workshop changed your approach to AI?", "textarea", None, 3, "Y"),
                    ("What was your favorite session/topic?", "text", None, 4, "N"),
                    ("Suggestions for improvement?", "textarea", None, 5, "N"),
                    ("Would you recommend this workshop to others?", "choice", '{"options":[{"value":"Y","label":"Yes"},{"value":"N","label":"No"}]}', 6, "Y"),
                ],
            }

            # Insert questions for each survey
            for slug, questions in survey_questions.items():
                template_id = template_ids[slug]
                for prompt, qtype, options, order, required in questions:
                    existing = self.fetch_one(
                        "SELECT ID FROM SURVEY_QUESTIONS WHERE TEMPLATE_ID = :tid AND PROMPT = :prompt",
                        {"tid": template_id, "prompt": prompt}
                    )
                    if not existing:
                        self.execute_dml("""
                            INSERT INTO SURVEY_QUESTIONS (TEMPLATE_ID, PROMPT, QUESTION_TYPE, OPTIONS, DISPLAY_ORDER, REQUIRED)
                            VALUES (:tid, :prompt, :qtype, :options, :display_order, :required)
                        """, {"tid": template_id, "prompt": prompt, "qtype": qtype, "options": options, "display_order": order, "required": required})

            print("✓ Survey templates and questions seeded")
        except Exception as exc:
            print(f"✗ Failed to seed survey templates and questions: {exc}")
            raise

    # Removed dead code: seed_onboarding_tasks method - tables no longer exist



    def test_connection(self) -> bool:
        try:
            self.execute_query("SELECT 1 FROM DUAL")
            return True
        except Exception as exc:
            error_msg = f"Oracle connection test failed: {exc}"
            print(f"ERROR: {error_msg}", file=sys.stderr)
            logger.error(error_msg)
            logger.error("Full traceback: %s", traceback.format_exc())
            return False

    def initialize_schema(self) -> bool:
        print("Starting database schema initialization...")
        try:
            self.rebuild_schema()
            print("✓ Schema rebuild completed")
        except Exception as exc:
            print(f"✗ Schema rebuild failed: {exc}")
            return False

        try:
            self.seed_defaults()
            print("✓ Default data seeded")
        except Exception as exc:
            print(f"✗ Default data seeding failed: {exc}")
            return False

        try:
            self.seed_survey_templates()
            print("✓ Survey templates seeded")
        except Exception as exc:
            print(f"✗ Survey templates seeding failed: {exc}")
            return False

        try:
            self.seed_survey_questions()
            print("✓ Survey questions seeded")
        except Exception as exc:
            print(f"✗ Survey questions seeding failed: {exc}")
            return False

        # Legacy task seeding and game logs seeding removed - tables no longer exist

        print("✓ Database schema initialization completed successfully")
        return True

    def reset_data(self) -> bool:
        """Reset data by deleting from tables and reseeding, without rebuilding schema."""
        print("Starting data reset...")
        try:
            # Delete data in dependency order (reverse of creation/insertion)
            delete_statements = [
                "DELETE FROM GAME_LOGS",
                "DELETE FROM ATTENDEE_INTRO_RESPONSES",
                "DELETE FROM ATTENDEE_ONBOARDING_RESPONSES",
                "DELETE FROM SURVEY_ANSWERS",
                "DELETE FROM SURVEY_SUBMISSIONS",
                "DELETE FROM SURVEY_QUESTIONS",
                "DELETE FROM SURVEY_TEMPLATES",
                "DELETE FROM ATTENDEES",
                "DELETE FROM COHORTS",
                "DELETE FROM INTRO_QUESTIONS",
                "DELETE FROM ONBOARDING_QUESTIONS",
                "DELETE FROM ADMIN_USERS",
            ]

            for stmt in delete_statements:
                table_name = stmt.replace("DELETE FROM ", "").strip()
                print(f"Clearing table: {table_name}")
                try:
                    result = self.execute_dml(stmt)
                    print(f"✓ Cleared table: {table_name} ({result} rows)")
                except Exception as exc:
                    print(f"✗ Failed to clear table: {table_name} - {exc}")
                    # Continue with other tables even if one fails
                    # return False

            print("✓ Data clearing completed")
        except Exception as exc:
            print(f"✗ Data clearing failed: {exc}")
            return False

        try:
            self.seed_defaults()
            print("✓ Data reseeding completed")
        except Exception as exc:
            print(f"✗ Data reseeding failed: {exc}")
            return False

        print("✓ Database data reset completed successfully")
        return True


db = DatabaseConnection()
