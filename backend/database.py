"""
Database connection and schema management for the Oracle-backed workshop survey system.
"""
from __future__ import annotations

import logging
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
            logger.info("Oracle connection pool initialized")
        except Exception as exc:  # pragma: no cover - requires Oracle runtime
            logger.error("Failed to initialize Oracle pool: %s", exc)
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
                return
            logger.debug("DDL statement failed: %s", statement)
            raise

    def rebuild_schema(self) -> None:
        drop_statements = [
            "DROP TABLE NL_QUERY_LOGS CASCADE CONSTRAINTS",
            "DROP TABLE SURVEY_ANSWERS CASCADE CONSTRAINTS",
            "DROP TABLE SURVEY_SUBMISSIONS CASCADE CONSTRAINTS",
            "DROP TABLE SURVEY_QUESTIONS CASCADE CONSTRAINTS",
            "DROP TABLE SURVEY_TEMPLATES CASCADE CONSTRAINTS",
            "DROP TABLE ATTENDEE_TASKS CASCADE CONSTRAINTS",
            "DROP TABLE COHORT_TASK_TEMPLATES CASCADE CONSTRAINTS",
            "DROP TABLE ONBOARDING_TASK_TEMPLATES CASCADE CONSTRAINTS",
            "DROP TABLE ATTENDEES CASCADE CONSTRAINTS",
            "DROP TABLE ADMIN_USERS CASCADE CONSTRAINTS",
            "DROP TABLE COHORTS CASCADE CONSTRAINTS",
            "DROP TABLE INTRO_QUESTIONS CASCADE CONSTRAINTS",
            "DROP TABLE ATTENDEE_INTRO_RESPONSES CASCADE CONSTRAINTS",
            "DROP TABLE SURVEY_RESPONSES CASCADE CONSTRAINTS",
            "DROP TABLE WORKSHOP_FEEDBACK CASCADE CONSTRAINTS",
            "DROP TABLE ONBOARDING_TASKS CASCADE CONSTRAINTS",
            "DROP TABLE ONBOARDING_TASKS_BACKUP CASCADE CONSTRAINTS",
            "DROP TABLE STUDENTS CASCADE CONSTRAINTS",
            "DROP TABLE STUDENTS_BACKUP CASCADE CONSTRAINTS",
            "DROP TABLE LOCATIONS CASCADE CONSTRAINTS",
        ]

        for stmt in drop_statements:
            try:
                self._safe_execute(stmt)
            except Exception as exc:
                logger.warning("Failed to drop object: %s", exc)

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
                IS_TEST CHAR(1) DEFAULT 'N' CHECK (IS_TEST IN ('Y','N')),
                CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (COHORT_ID, EMAIL)
            )
            """,
            """
            CREATE TABLE ONBOARDING_TASK_TEMPLATES (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                TITLE VARCHAR2(255) NOT NULL,
                DESCRIPTION VARCHAR2(1000),
                INSTRUCTIONS_URL VARCHAR2(500),
                REQUIRED CHAR(1) DEFAULT 'Y' CHECK (REQUIRED IN ('Y','N')),
                DISPLAY_ORDER NUMBER DEFAULT 0,
                CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE COHORT_TASK_TEMPLATES (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                COHORT_ID NUMBER NOT NULL REFERENCES COHORTS(ID) ON DELETE CASCADE,
                TEMPLATE_ID NUMBER NOT NULL REFERENCES ONBOARDING_TASK_TEMPLATES(ID) ON DELETE CASCADE,
                DISPLAY_ORDER NUMBER DEFAULT 0,
                UNIQUE (COHORT_ID, TEMPLATE_ID)
            )
            """,
            """
            CREATE TABLE ATTENDEE_TASKS (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                ATTENDEE_ID NUMBER NOT NULL REFERENCES ATTENDEES(ID) ON DELETE CASCADE,
                TEMPLATE_ID NUMBER NOT NULL REFERENCES ONBOARDING_TASK_TEMPLATES(ID) ON DELETE CASCADE,
                STATUS VARCHAR2(20) DEFAULT 'PENDING',
                COMPLETED_AT TIMESTAMP,
                NOTES VARCHAR2(1000),
                UNIQUE (ATTENDEE_ID, TEMPLATE_ID)
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
            CREATE TABLE SURVEY_TEMPLATES (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                NAME VARCHAR2(255) NOT NULL,
                SLUG VARCHAR2(60) UNIQUE NOT NULL,
                DESCRIPTION VARCHAR2(1000),
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
            CREATE TABLE NL_QUERY_LOGS (
                ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                ADMIN_ID NUMBER REFERENCES ADMIN_USERS(ID) ON DELETE SET NULL,
                PROMPT CLOB NOT NULL,
                GENERATED_SQL CLOB,
                ROW_COUNT NUMBER,
                LATENCY_MS NUMBER,
                CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
        ]

        for stmt in create_statements:
            self.execute_dml(stmt)

        logger.info("Oracle schema rebuilt for 2026 workshop")
    def seed_defaults(self) -> None:
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
                "agenda": None,
            },
        )

        templates = [
            {
                "title": "Introduce Yourself",
                "description": "Share a short bio with fellow participants.",
                "url": None,
                "required": "Y",
                "display_order": 1,
            },
            {
                "title": "Confirm Travel",
                "description": "Verify travel and accommodation arrangements are finalized.",
                "url": None,
                "required": "Y",
                "display_order": 2,
            },
            {
                "title": "Setup Development Environment",
                "description": "Install tooling before arriving onsite.",
                "url": None,
                "required": "Y",
                "display_order": 3,
            },
        ]

        for template in templates:
            self.execute_dml(
                """
                MERGE INTO ONBOARDING_TASK_TEMPLATES t
                USING (SELECT :title AS TITLE FROM DUAL) src
                ON (t.TITLE = src.TITLE)
                WHEN NOT MATCHED THEN
                    INSERT (TITLE, DESCRIPTION, INSTRUCTIONS_URL, REQUIRED, DISPLAY_ORDER)
                    VALUES (:title, :description, :url, :required, :display_order)
                WHEN MATCHED THEN
                    UPDATE SET DESCRIPTION = :description,
                               INSTRUCTIONS_URL = :url,
                               REQUIRED = :required,
                               DISPLAY_ORDER = :display_order
                """,
                template,
            )

        cohort_row = self.execute_query("SELECT ID FROM COHORTS WHERE COHORT_CODE = :code", {"code": "MDC2026"})
        cohort_id = None
        template_rows = []
        if cohort_row:
            cohort_id = cohort_row[0][0]
            template_rows = self.execute_query("SELECT ID, DISPLAY_ORDER FROM ONBOARDING_TASK_TEMPLATES ORDER BY DISPLAY_ORDER")
            for tpl_id, display_order in template_rows:
                self.execute_dml(
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
                    {"cohort_id": cohort_id, "template_id": tpl_id, "display_order": display_order},
                )

        self.execute_dml(
            """
            MERGE INTO SURVEY_TEMPLATES t
            USING (SELECT :slug AS SLUG FROM DUAL) src
            ON (t.SLUG = src.SLUG)
            WHEN NOT MATCHED THEN
                INSERT (NAME, SLUG, DESCRIPTION)
                VALUES (:name, :slug, :description)
            """,
            {
                "name": "Post-Event Feedback",
                "slug": "post-workshop",
                "description": "Collect reflections after the workshop.",
            },
        )

        survey_row = self.execute_query("SELECT ID FROM SURVEY_TEMPLATES WHERE SLUG = :slug", {"slug": "post-workshop"})
        survey_id = None
        if survey_row:
            survey_id = survey_row[0][0]
            questions = [
                {
                    "prompt": "Overall, how satisfied are you with the workshop?",
                    "kind": "likert",
                    "options": '{\"scale\":5}',
                    "display_order": 1,
                    "required": "Y",
                },
                {
                    "prompt": "What was the highlight for you?",
                    "kind": "text",
                    "options": None,
                    "display_order": 2,
                    "required": "N",
                },
                {
                    "prompt": "Where can we improve?",
                    "kind": "text",
                    "options": None,
                    "display_order": 3,
                    "required": "N",
                },
            ]
            for question in questions:
                params = question | {"template_id": survey_id}
                self.execute_dml(
                    """
                    MERGE INTO SURVEY_QUESTIONS t
                    USING (SELECT :template_id AS TEMPLATE_ID, :prompt AS PROMPT FROM DUAL) src
                    ON (t.TEMPLATE_ID = src.TEMPLATE_ID AND t.PROMPT = src.PROMPT)
                    WHEN NOT MATCHED THEN
                        INSERT (TEMPLATE_ID, PROMPT, QUESTION_TYPE, OPTIONS, DISPLAY_ORDER, REQUIRED)
                        VALUES (:template_id, :prompt, :kind, :options, :display_order, :required)
                    WHEN MATCHED THEN
                        UPDATE SET QUESTION_TYPE = :kind,
                                   OPTIONS = :options,
                                   DISPLAY_ORDER = :display_order,
                                   REQUIRED = :required
                    """,
                    params,
                )

        if cohort_id and template_rows:
            test_attendees = [
                {"email": "test1@test.org", "full_name": "Jordan Rivera"},
                {"email": "test2@test.org", "full_name": "Casey Morgan"},
                {"email": "test3@test.org", "full_name": "Taylor Quinn"},
            ]

            for attendee in test_attendees:
                attendee_row = self.fetch_one(
                    "SELECT ID FROM ATTENDEES WHERE COHORT_ID = :cohort_id AND UPPER(EMAIL) = UPPER(:email)",
                    {"cohort_id": cohort_id, "email": attendee["email"]},
                )

                if attendee_row:
                    attendee_id = attendee_row[0]
                    self.execute_dml(
                        "UPDATE ATTENDEES SET FULL_NAME = :full_name, IS_TEST = 'Y' WHERE ID = :attendee_id",
                        {"full_name": attendee["full_name"], "attendee_id": attendee_id},
                    )
                else:
                    attendee_id = self.execute_returning(
                        """
                        INSERT INTO ATTENDEES (COHORT_ID, EMAIL, FULL_NAME, IS_TEST)
                        VALUES (:cohort_id, :email, :full_name, 'Y')
                        RETURNING ID INTO :out_id
                        """,
                        {
                            "cohort_id": cohort_id,
                            "email": attendee["email"],
                            "full_name": attendee["full_name"],
                        },
                    )

                for template_id, _ in template_rows:
                    self.execute_dml(
                        """
                        MERGE INTO ATTENDEE_TASKS t
                        USING (SELECT :attendee_id AS ATTENDEE_ID, :template_id AS TEMPLATE_ID FROM DUAL) src
                        ON (t.ATTENDEE_ID = src.ATTENDEE_ID AND t.TEMPLATE_ID = src.TEMPLATE_ID)
                        WHEN NOT MATCHED THEN
                            INSERT (ATTENDEE_ID, TEMPLATE_ID, STATUS)
                            VALUES (:attendee_id, :template_id, 'PENDING')
                        """,
                        {
                            "attendee_id": attendee_id,
                            "template_id": template_id,
                        },
                    )

                submissions_count = self.fetch_one(
                    "SELECT COUNT(*) FROM SURVEY_SUBMISSIONS WHERE ATTENDEE_ID = :attendee_id",
                    {"attendee_id": attendee_id},
                ) or (0,)

                if survey_id and submissions_count[0] == 0:
                    self.execute_dml(
                        """
                        INSERT INTO SURVEY_SUBMISSIONS (ATTENDEE_ID, TEMPLATE_ID)
                        VALUES (:attendee_id, :template_id)
                        """,
                        {
                            "attendee_id": attendee_id,
                            "template_id": survey_id,
                        },
                    )

        intro_questions = [
            {"code": "intro", "prompt": "Tell us about yourself.", "order": 1, "required": "Y"},
            {"code": "fun_fact", "prompt": "Share a fun fact your cohort should know.", "order": 2, "required": "Y"},
            {"code": "two_truths", "prompt": "Two truths and a lie (let your peers guess!).", "order": 3, "required": "N"},
        ]

        for question in intro_questions:
            self.execute_dml(
                """
                MERGE INTO INTRO_QUESTIONS t
                USING (SELECT :code AS CODE FROM DUAL) src
                ON (t.CODE = src.CODE)
                WHEN NOT MATCHED THEN
                    INSERT (CODE, PROMPT, DISPLAY_ORDER, REQUIRED)
                    VALUES (:code, :prompt, :display_order, :required)
                WHEN MATCHED THEN
                    UPDATE SET PROMPT = :prompt,
                               DISPLAY_ORDER = :display_order,
                               REQUIRED = :required,
                               ACTIVE = 'Y',
                               UPDATED_AT = CURRENT_TIMESTAMP
                """,
                {
                    "code": question["code"],
                    "prompt": question["prompt"],
                    "display_order": question["order"],
                    "required": question["required"],
                },
            )

        question_rows = self.execute_query(
            "SELECT CODE, ID FROM INTRO_QUESTIONS WHERE ACTIVE = 'Y'",
        )
        question_map = {code: qid for code, qid in question_rows}

        intro_seed = {
            "test1@test.org": {
                "intro": "I lead the Redwood UI workstream and mentor new attendees.",
                "fun_fact": "Ran a marathon on every continent.",
                "two_truths": "I speak four languages; I can't ride a bike; I design board games.",
            },
            "test2@test.org": {
                "intro": "I coordinate travel logistics and on-site experiences.",
                "fun_fact": "Collect vintage typewriters.",
                "two_truths": "I've met three astronauts; I hate coffee; I code during flights.",
            },
            "test3@test.org": {
                "intro": "I run daily AI lab sessions for MDC cohorts.",
                "fun_fact": "Once DJ'd a workshop after-party.",
                "two_truths": "I paint abstract art; I have a twin; I'm terrified of heights.",
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

        logger.info("Seed data inserted for MDC cohort")
    def test_connection(self) -> bool:
        try:
            self.execute_query("SELECT 1 FROM DUAL")
            return True
        except Exception as exc:
            logger.error("Oracle connection test failed: %s", exc)
            return False

    def initialize_schema(self) -> bool:
        try:
            self.rebuild_schema()
            self.seed_defaults()
            return True
        except Exception as exc:
            logger.error("Failed to rebuild Oracle schema: %s", exc)
            return False


db = DatabaseConnection()
