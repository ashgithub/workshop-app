"""
Admin router for administrative functions including NL to SQL queries and game management.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import logging
import os

from ..database import db
# NL_QUERY functionality disabled - unused schema imports commented out
# from ..schemas import AdminQueryRequest, AdminQueryResponse, GameAttendee
import select_ai
from ..config import config
from ..services import onboarding as onboarding_service
from ..services import dashboard as dashboard_service

router = APIRouter()
logger = logging.getLogger(__name__)

# Global SELECT AI profile instance
_select_ai_profile = None


def get_select_ai_profile():
    """Get or create the SELECT AI profile instance."""
    global _select_ai_profile
    if _select_ai_profile is None:
        try:
            # Connect to Oracle using existing database credentials
            select_ai.connect(
                user=config.oracle_user,
                password=config.oracle_password,
                dsn=config.oracle_dsn,
                config_dir=config.oracle_wallet,
                wallet_location=config.oracle_wallet,
                wallet_password=config.oracle_wallet_pass,
            )
            # Create AI profile
            _select_ai_profile = select_ai.Profile(profile_name=config.oracle_select_ai_profile)
            logger.info(f"Oracle SELECT AI profile '{config.oracle_select_ai_profile}' initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Oracle SELECT AI profile: {e}")
            raise HTTPException(status_code=500, detail="Natural language query service unavailable")
    return _select_ai_profile


@router.get("/attendees")
async def get_all_attendees(
    location: Optional[str] = Query(None, description="Filter by location (e.g., AUS)"),
    intro_lt: Optional[int] = Query(None, description="Filter attendees with intro completed count <= x"),
    onboarding_lt: Optional[int] = Query(None, description="Filter attendees with onboarding tasks completed <= x"),
    survey_lt: Optional[int] = Query(None, description="Filter attendees with surveys completed <= x"),
    ack_filter: Optional[str] = Query(None, regex="^(Y|N|any)$", description="Filter by ACK (Y, N, or any)"),
    sort_by: Optional[str] = Query("name", description="Sort by field: name, location, overall_progress, intro_completed, onboarding_completed, surveys_completed"),
    order: Optional[str] = Query("asc", regex="^(asc|desc)$", description="Sort order: asc or desc")
):
    """
    Get all attendees with calculated progress for admin dashboard, supporting filters and sorting.
    """
    try:
        # Compute intro_completed_count: team + intro + (tl1/tl2/tl3 all filled) + mac_pc (4 fields total)
        intro_count_subquery = """
        (CASE WHEN ir1.RESPONSE IS NOT NULL AND LENGTH(TRIM(ir1.RESPONSE)) > 0 THEN 1 ELSE 0 END +
        CASE WHEN ir2.RESPONSE IS NOT NULL AND LENGTH(TRIM(ir2.RESPONSE)) > 0 THEN 1 ELSE 0 END +
        CASE WHEN ir3.RESPONSE IS NOT NULL AND LENGTH(TRIM(ir3.RESPONSE)) > 0
                AND ir4.RESPONSE IS NOT NULL AND LENGTH(TRIM(ir4.RESPONSE)) > 0
                AND ir5.RESPONSE IS NOT NULL AND LENGTH(TRIM(ir5.RESPONSE)) > 0 THEN 1 ELSE 0 END +
        CASE WHEN ir6.RESPONSE IS NOT NULL AND LENGTH(TRIM(ir6.RESPONSE)) > 0 THEN 1 ELSE 0 END) as intro_completed_count
        """
        # Base query
        base_query = """
        SELECT
            a.ID,
            a.EMAIL,
            a.FULL_NAME,
            c.LOCATION_NAME,
            ir1.RESPONSE as TEAM,
            ir2.RESPONSE as INTRO,
            ir3.RESPONSE as TL1,
            ir4.RESPONSE as TL2,
            ir5.RESPONSE as TL3,
            ir6.RESPONSE as MAC_PC,
            CASE WHEN a.ACKNOWLEDGED = 'Y' THEN 'Y' ELSE 'N' END as ACK,
            CASE WHEN oq_progress.completed_count = oq_progress.total_count THEN 'Y' ELSE 'N' END as ON_BOARDED,
            'N' as PLAYED_2T1L, -- Placeholder, will be removed
            COALESCE(oq_progress.completed_count, 0) as tasks_completed,
            COALESCE(oq_progress.total_count, 11) as tasks_total,
            COALESCE(survey_count.survey_count, 0) as surveys_completed,
            {intro_count},
            CASE
                WHEN a.ACKNOWLEDGED = 'Y' THEN 25
                ELSE 0
            END +
            CASE
                WHEN ir1.RESPONSE IS NOT NULL AND LENGTH(TRIM(ir1.RESPONSE)) > 0 AND ir2.RESPONSE IS NOT NULL AND LENGTH(TRIM(ir2.RESPONSE)) > 0 THEN 25
                ELSE 0
            END +
            CASE
                WHEN COALESCE(oq_progress.completed_count, 0) = COALESCE(oq_progress.total_count, 11) AND COALESCE(oq_progress.total_count, 11) > 0 THEN 25
                ELSE 0
            END +
            CASE
                WHEN COALESCE(survey_count.survey_count, 0) > 0 THEN 25
                ELSE 0
            END as overall_progress
        FROM ATTENDEES a
        JOIN COHORTS c ON c.ID = a.COHORT_ID
        LEFT JOIN ATTENDEE_INTRO_RESPONSES ir1 ON ir1.ATTENDEE_ID = a.ID AND ir1.QUESTION_ID = (SELECT ID FROM INTRO_QUESTIONS WHERE CODE = 'team_name')
        LEFT JOIN ATTENDEE_INTRO_RESPONSES ir2 ON ir2.ATTENDEE_ID = a.ID AND ir2.QUESTION_ID = (SELECT ID FROM INTRO_QUESTIONS WHERE CODE = 'intro')
        LEFT JOIN ATTENDEE_INTRO_RESPONSES ir3 ON ir3.ATTENDEE_ID = a.ID AND ir3.QUESTION_ID = (SELECT ID FROM INTRO_QUESTIONS WHERE CODE = 'truth_1')
        LEFT JOIN ATTENDEE_INTRO_RESPONSES ir4 ON ir4.ATTENDEE_ID = a.ID AND ir4.QUESTION_ID = (SELECT ID FROM INTRO_QUESTIONS WHERE CODE = 'truth_2')
        LEFT JOIN ATTENDEE_INTRO_RESPONSES ir5 ON ir5.ATTENDEE_ID = a.ID AND ir5.QUESTION_ID = (SELECT ID FROM INTRO_QUESTIONS WHERE CODE = 'truth_3')
        LEFT JOIN ATTENDEE_INTRO_RESPONSES ir6 ON ir6.ATTENDEE_ID = a.ID AND ir6.QUESTION_ID = (SELECT ID FROM INTRO_QUESTIONS WHERE CODE = 'device_pref')
        LEFT JOIN (
            SELECT
                ATTENDEE_ID,
                COUNT(*) as total_count,
                COUNT(CASE WHEN RESPONSE IS NOT NULL AND LENGTH(TRIM(RESPONSE)) > 0 THEN 1 END) as completed_count
            FROM ATTENDEE_ONBOARDING_RESPONSES
            GROUP BY ATTENDEE_ID
        ) oq_progress ON a.ID = oq_progress.ATTENDEE_ID
        LEFT JOIN (
            SELECT ATTENDEE_ID, COUNT(*) as survey_count
            FROM SURVEY_SUBMISSIONS
            GROUP BY ATTENDEE_ID
        ) survey_count ON a.ID = survey_count.ATTENDEE_ID
        WHERE 1=1
        """

        params = {}
        conditions = []

        if location:
            conditions.append("c.LOCATION_NAME = :location")
            params["location"] = location

        if intro_lt is not None:
            conditions.append("intro_completed_count <= :intro_lt")
            params["intro_lt"] = intro_lt

        if onboarding_lt is not None:
            conditions.append("COALESCE(oq_progress.completed_count, 0) <= :onboarding_lt")
            params["onboarding_lt"] = onboarding_lt

        if survey_lt is not None:
            conditions.append("COALESCE(survey_count.survey_count, 0) <= :survey_lt")
            params["survey_lt"] = survey_lt

        if ack_filter and ack_filter != "any":
            ack_upper = ack_filter.upper()
            if ack_upper == "Y":
                conditions.append("a.ACKNOWLEDGED = 'Y'")
            elif ack_upper == "N":
                conditions.append("(a.ACKNOWLEDGED != 'Y' OR a.ACKNOWLEDGED IS NULL)")

        where_clause = " AND ".join(conditions) if conditions else ""

        # Sorting
        valid_sort_fields = ["a.FULL_NAME", "c.LOCATION_NAME", "overall_progress", "intro_completed_count", "tasks_completed", "surveys_completed", "a.ACKNOWLEDGED"]
        sort_by_lower = (sort_by or "").lower()
        sort_field = next((field for field in valid_sort_fields if sort_by_lower in field.lower()), "a.FULL_NAME")
        if sort_by == "name":
            sort_field = "a.FULL_NAME"
        elif sort_by == "location":
            sort_field = "c.LOCATION_NAME"
        elif sort_by == "overall_progress":
            sort_field = "overall_progress"
        elif sort_by == "intro_completed":
            sort_field = "intro_completed_count"
        elif sort_by == "onboarding_completed":
            sort_field = "tasks_completed"
        elif sort_by == "surveys_completed":
            sort_field = "surveys_completed"
        elif sort_by == "ack":
            sort_field = "a.ACKNOWLEDGED"
        else:
            sort_field = "a.FULL_NAME"

        order_by = f"ORDER BY {sort_field} {(order or 'asc').upper()}"

        full_query = base_query.format(intro_count=intro_count_subquery) + f" AND {where_clause}" if where_clause else base_query.format(intro_count=intro_count_subquery)
        full_query += f" {order_by}"

        result = db.execute_query(full_query, params)

        if not result:
            return []

        attendees = []
        for row in result:
            # DEBUG: Now using correct field order for intro fields!
            if row[1] == 'vineet.bedi@oracle.com':
                logging.warning(
                    f"[DEBUG] vineet.bedi@oracle.com - TEAM:{row[4]!r} INTRO:{row[5]!r} TL1:{row[6]!r} TL2:{row[7]!r} TL3:{row[8]!r} MAC_PC:{row[9]!r} "
                    f"INTRO_COMPLETED_COUNT:{row[16]!r} TASKS:{row[13]!r}/{row[14]!r} SURVEYS:{row[15]!r}/11"
                )

            attendee = {
                "student_id": row[0],
                "email_address": row[1],
                "name": row[2],
                "location": row[3],
                "team": row[4],
                "intro": row[5],
                "tl1": row[6],
                "tl2": row[7],
                "tl3": row[8],
                "mac_pc": row[9],
                "ack": row[10],
                "on_boarded": row[11],
                "played_2t1l": row[12],
                "tasks_completed": row[13],
                "tasks_total": row[14],
                "surveys_completed": row[15],
                "surveys_total": 11,
                "intro_completed_count": row[16],
                "overall_progress": row[17]
            }
            attendees.append(attendee)

        return attendees

    except Exception as e:
        logger.error(f"Error getting attendees: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# NL_QUERY functionality disabled - natural language query endpoints commented out
# @router.post("/query", response_model=AdminQueryResponse)
# async def execute_natural_language_query(query_request: AdminQueryRequest):
#     """
#     Execute natural language query using Oracle SELECT AI.
#     """
#     try:
#         # Get the SELECT AI profile
#         profile = get_select_ai_profile()

#         # Execute the natural language query
#         df = profile.run_sql(prompt=query_request.query)

#         # Convert DataFrame to list of dictionaries
#         results = []
#         if not df.empty:
#             results = df.to_dict('records')

#         # Generate a summary based on the results
#         if df.empty:
#             summary = "No results found for the query"
#         else:
#             num_rows = len(df)
#             num_cols = len(df.columns)
#             summary = f"Found {num_rows} result{'s' if num_rows != 1 else ''} with {num_cols} column{'s' if num_cols != 1 else ''}"

#         return AdminQueryResponse(
#             query=query_request.query,
#             results=results,
#             summary=summary
#         )

#     except Exception as e:
#         logger.error(f"Error executing natural language query '{query_request.query}': {e}")
#         raise HTTPException(status_code=500, detail=f"Query execution failed: {str(e)}")


@router.get("/locations")
async def get_locations():
    """
    Get list of unique locations for the game dropdown.
    """
    try:
        result = db.execute_query("""
            SELECT DISTINCT LOCATION_NAME
            FROM COHORTS
            WHERE LOCATION_NAME IS NOT NULL
            ORDER BY LOCATION_NAME
        """)

        locations = [row[0] for row in result] if result else []
        return {"locations": locations}

    except Exception as e:
        logger.error(f"Error getting locations: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# Game functionality removed - was dependent on legacy STUDENTS table
# @router.get("/game/progress")
# @router.get("/game/next")
# @router.put("/game/played/{student_id}")
# @router.put("/game/reset")


# Onboarding Questions Management
@router.get("/onboarding/questions")
async def list_onboarding_questions(include_inactive: bool = False):
    """
    Get all onboarding questions for admin management.
    """
    try:
        return onboarding_service.list_questions(include_inactive)
    except Exception as e:
        logger.error(f"Error listing onboarding questions: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/onboarding/questions/{question_id}")
async def get_onboarding_question(question_id: int):
    """
    Get a specific onboarding question.
    """
    try:
        question = onboarding_service.get_question(question_id)
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        return question
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting onboarding question {question_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/dashboard")
async def get_dashboard_overview(cohort_id: int, include_test: bool = False):
    """Aggregate cohort progress metrics for admin analytics dashboard."""
    try:
        summary = dashboard_service.get_dashboard_summary(cohort_id, include_test)
        return summary
    except dashboard_service.CohortNotFoundError:
        raise HTTPException(status_code=404, detail="Cohort not found")
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("Failed to gather dashboard summary for cohort %s: %s", cohort_id, exc)
        raise HTTPException(status_code=500, detail="Unable to load dashboard summary")


# Game Management Endpoints
@router.get("/game/attendees")
async def get_game_attendees(cohort_id: int):
    """
    Get all attendees with their 2TL statements and game status for admin management.
    """
    try:
        # Verify cohort exists
        cohort_check = db.execute_query("SELECT ID, TITLE, LOCATION_NAME FROM COHORTS WHERE ID = :cohort_id", {"cohort_id": cohort_id})
        if not cohort_check:
            raise HTTPException(status_code=404, detail="Cohort not found")

        cohort_info = cohort_check[0]

        # Get attendees with their 2TL responses and game status
        query = """
        SELECT
            a.ID,
            a.FULL_NAME,
            a.EMAIL,
            a.TITLE,
            a.MANAGER,
            a.PROFILE_IMAGE,
            c.ID as COHORT_ID,
            c.TITLE as COHORT_TITLE,
            c.LOCATION_NAME,
            c.ROOM,
            c.START_DATE,
            c.END_DATE,
            c.START_TIME,
            c.END_TIME,
            ir1.RESPONSE as TL1,
            ir2.RESPONSE as TL2,
            ir3.RESPONSE as TL3,
            COALESCE(gl.STATUS, 'PENDING') as GAME_STATUS,
            gl.REVEALED_LIE
        FROM ATTENDEES a
        JOIN COHORTS c ON c.ID = a.COHORT_ID
        LEFT JOIN ATTENDEE_INTRO_RESPONSES ir1 ON ir1.ATTENDEE_ID = a.ID AND ir1.QUESTION_ID = (SELECT ID FROM INTRO_QUESTIONS WHERE CODE = 'truth_1')
        LEFT JOIN ATTENDEE_INTRO_RESPONSES ir2 ON ir2.ATTENDEE_ID = a.ID AND ir2.QUESTION_ID = (SELECT ID FROM INTRO_QUESTIONS WHERE CODE = 'truth_2')
        LEFT JOIN ATTENDEE_INTRO_RESPONSES ir3 ON ir3.ATTENDEE_ID = a.ID AND ir3.QUESTION_ID = (SELECT ID FROM INTRO_QUESTIONS WHERE CODE = 'truth_3')
        LEFT JOIN GAME_LOGS gl ON gl.ATTENDEE_ID = a.ID
        WHERE c.ID = :cohort_id
        ORDER BY a.FULL_NAME
        """

        result = db.execute_query(query, {"cohort_id": cohort_id})

        if not result:
            return {"attendees": [], "cohort": {"id": cohort_info[0], "title": cohort_info[1], "location": cohort_info[2]}}

        attendees = []
        for row in result:
            attendee = {
                "id": row[0],
                "full_name": row[1],
                "email": row[2],
                "title": row[3],
                "manager": row[4],
                "profile_image": row[5],
                "cohort": {
                    "id": row[6],
                    "title": row[7],
                    "location": row[8],
                    "room": row[9],
                    "start_date": str(row[10]) if row[10] else None,
                    "end_date": str(row[11]) if row[11] else None,
                    "start_time": str(row[12]) if row[12] else None,
                    "end_time": str(row[13]) if row[13] else None
                },
                "tl1": str(row[14]) if row[14] is not None else None,
                "tl2": str(row[15]) if row[15] is not None else None,
                "tl3": str(row[16]) if row[16] is not None else None,
                "game_status": row[17] or "PENDING",
                "revealed_lie": row[18]
            }
            attendees.append(attendee)

        return {
            "attendees": attendees,
            "cohort": {
                "id": cohort_info[0],
                "title": cohort_info[1],
                "location": cohort_info[2]
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting game attendees for cohort {cohort_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/game/progress")
async def get_game_progress(cohort_id: int):
    """
    Get progress for 2 Truths and a Lie game: number played vs total attendees for a cohort.
    """
    try:
        # Total: all attendees in cohort with statements
        total_result = db.execute_query("""
            SELECT COUNT(DISTINCT a.ID)
            FROM ATTENDEES a
            JOIN COHORTS c ON c.ID = a.COHORT_ID
            JOIN ATTENDEE_INTRO_RESPONSES ir ON ir.ATTENDEE_ID = a.ID
            JOIN INTRO_QUESTIONS iq ON iq.ID = ir.QUESTION_ID AND iq.CODE IN ('truth_1', 'truth_2', 'truth_3')
            WHERE c.ID = :cohort_id
            AND LENGTH(TRIM(ir.RESPONSE)) > 0
        """, {"cohort_id": cohort_id})
        total = total_result[0][0] if total_result and len(total_result) > 0 else 0

        # Played: attendees marked as played in GAME_LOGS
        played_result = db.execute_query("""
            SELECT COUNT(*)
            FROM ATTENDEES a
            JOIN COHORTS c ON c.ID = a.COHORT_ID
            JOIN GAME_LOGS gl ON gl.ATTENDEE_ID = a.ID
            WHERE c.ID = :cohort_id
            AND gl.STATUS = 'PLAYED'
        """, {"cohort_id": cohort_id})
        played_count = played_result[0][0] if played_result and len(played_result) > 0 else 0

        return {"played": played_count, "total": total, "progress": f"{played_count}/{total}"}

    except Exception as e:
        logger.error(f"Error getting game progress for cohort {cohort_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/game/next")
async def get_next_game_attendee(cohort_id: int):
    """
    Get random attendee who hasn't played yet for the 2TL game.
    """
    try:
        # Get random attendee who hasn't played and has statements
        result = db.execute_query("""
            SELECT
                a.ID,
                a.FULL_NAME,
                a.EMAIL,
                a.TITLE,
                a.MANAGER,
                a.PROFILE_IMAGE,
                c.ID as COHORT_ID,
                c.TITLE as COHORT_TITLE,
                c.LOCATION_NAME,
                c.ROOM,
                c.START_DATE,
                c.END_DATE,
                c.START_TIME,
                c.END_TIME,
                ir1.RESPONSE as INTRO,
                ir2.RESPONSE as TL1,
                ir3.RESPONSE as TL2,
                ir4.RESPONSE as TL3,
                COALESCE(gl.STATUS, 'PENDING') as GAME_STATUS
            FROM ATTENDEES a
            JOIN COHORTS c ON c.ID = a.COHORT_ID
            LEFT JOIN ATTENDEE_INTRO_RESPONSES ir1 ON ir1.ATTENDEE_ID = a.ID AND ir1.QUESTION_ID = (SELECT ID FROM INTRO_QUESTIONS WHERE CODE = 'intro')
            LEFT JOIN ATTENDEE_INTRO_RESPONSES ir2 ON ir2.ATTENDEE_ID = a.ID AND ir2.QUESTION_ID = (SELECT ID FROM INTRO_QUESTIONS WHERE CODE = 'truth_1')
            LEFT JOIN ATTENDEE_INTRO_RESPONSES ir3 ON ir3.ATTENDEE_ID = a.ID AND ir3.QUESTION_ID = (SELECT ID FROM INTRO_QUESTIONS WHERE CODE = 'truth_2')
            LEFT JOIN ATTENDEE_INTRO_RESPONSES ir4 ON ir4.ATTENDEE_ID = a.ID AND ir4.QUESTION_ID = (SELECT ID FROM INTRO_QUESTIONS WHERE CODE = 'truth_3')
            LEFT JOIN GAME_LOGS gl ON gl.ATTENDEE_ID = a.ID
            WHERE c.ID = :cohort_id
            AND (gl.STATUS IS NULL OR gl.STATUS != 'PLAYED')
            AND (ir2.RESPONSE IS NOT NULL OR ir3.RESPONSE IS NOT NULL OR ir4.RESPONSE IS NOT NULL)
            ORDER BY DBMS_RANDOM.VALUE
            FETCH FIRST 1 ROW ONLY
        """, {"cohort_id": cohort_id})

        if not result or len(result) == 0:
            return {"message": "No more attendees available for the game."}

        row = result[0]
        attendee = {
            "id": row[0],
            "full_name": row[1],
            "email": row[2],
            "title": row[3],
            "manager": row[4],
            "profile_image": row[5],
            "cohort": {
                "id": row[6],
                "title": row[7],
                "location": row[8],
                "room": row[9],
                "start_date": str(row[10]) if row[10] else None,
                "end_date": str(row[11]) if row[11] else None,
                "start_time": str(row[12]) if row[12] else None,
                "end_time": str(row[13]) if row[13] else None
            },
            "intro": str(row[14]) if row[14] is not None else None,
            "tl1": str(row[15]) if row[15] is not None else None,
            "tl2": str(row[16]) if row[16] is not None else None,
            "tl3": str(row[17]) if row[17] is not None else None,
            "game_status": row[18] or "PENDING"
        }

        return {"attendee": attendee}

    except Exception as e:
        logger.error(f"Error getting next game attendee for cohort {cohort_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/game/play/{attendee_id}")
async def mark_attendee_as_played(attendee_id: int):
    """
    Mark attendee as having played the 2TL game.
    """
    try:
        # Insert or update GAME_LOGS record
        db.execute_dml("""
            MERGE INTO GAME_LOGS gl
            USING (SELECT :attendee_id AS ATTENDEE_ID FROM DUAL) src
            ON (gl.ATTENDEE_ID = src.ATTENDEE_ID)
            WHEN MATCHED THEN
                UPDATE SET STATUS = 'PLAYED', TIMESTAMP = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (ATTENDEE_ID, STATUS, TIMESTAMP)
                VALUES (:attendee_id, 'PLAYED', CURRENT_TIMESTAMP)
        """, {"attendee_id": attendee_id})

        return {"message": "Attendee marked as played"}

    except Exception as e:
        logger.error(f"Error marking attendee {attendee_id} as played: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/game/reveal/{attendee_id}")
async def reveal_lie(attendee_id: int, lie_number: int = Query(..., description="Which statement is the lie (1, 2, or 3)")):
    """
    Reveal which statement was the lie for an attendee.
    """
    try:
        if lie_number not in [1, 2, 3]:
            raise HTTPException(status_code=400, detail="Lie number must be 1, 2, or 3")

        # Update GAME_LOGS with revealed lie
        db.execute_dml("""
            MERGE INTO GAME_LOGS gl
            USING (SELECT :attendee_id AS ATTENDEE_ID FROM DUAL) src
            ON (gl.ATTENDEE_ID = src.ATTENDEE_ID)
            WHEN MATCHED THEN
                UPDATE SET STATUS = 'REVEALED', REVEALED_LIE = :lie_number, TIMESTAMP = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (ATTENDEE_ID, STATUS, REVEALED_LIE, TIMESTAMP)
                VALUES (:attendee_id, 'REVEALED', :lie_number, CURRENT_TIMESTAMP)
        """, {"attendee_id": attendee_id, "lie_number": lie_number})

        return {"message": f"Revealed statement {lie_number} as the lie"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revealing lie for attendee {attendee_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/game/reset")
async def reset_game_flags(cohort_id: int):
    """
    Reset game flags for all attendees in a specific cohort.
    """
    try:
        # Check if cohort exists
        cohort_check = db.execute_query(
            "SELECT ID FROM COHORTS WHERE ID = :cohort_id",
            {"cohort_id": cohort_id}
        )
        if not cohort_check or cohort_check[0][0] == 0:
            raise HTTPException(status_code=404, detail="No attendees found for the specified cohort")

        # Delete game logs for this cohort
        affected_rows = db.execute_dml("""
            DELETE FROM GAME_LOGS
            WHERE ATTENDEE_ID IN (
                SELECT a.ID FROM ATTENDEES a
                JOIN COHORTS c ON c.ID = a.COHORT_ID
                WHERE c.ID = :cohort_id
            )
        """, {"cohort_id": cohort_id})

        return {"message": f"Reset game status for {affected_rows} attendees in cohort {cohort_id}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting game flags for cohort {cohort_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
