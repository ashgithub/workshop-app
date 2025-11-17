"""
Admin router for administrative functions including NL to SQL queries and game management.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import logging
import os

from ..database import db
from ..schemas import AdminQueryRequest, AdminQueryResponse, GameAttendee

router = APIRouter()
logger = logging.getLogger(__name__)


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
        (CASE WHEN s.TEAM IS NOT NULL AND LENGTH(TRIM(s.TEAM)) > 0 THEN 1 ELSE 0 END +
        CASE WHEN s.INTRO IS NOT NULL AND LENGTH(TRIM(s.INTRO)) > 0 THEN 1 ELSE 0 END +
        CASE WHEN s.TL1 IS NOT NULL AND LENGTH(TRIM(s.TL1)) > 0 
                AND s.TL2 IS NOT NULL AND LENGTH(TRIM(s.TL2)) > 0 
                AND s.TL3 IS NOT NULL AND LENGTH(TRIM(s.TL3)) > 0 THEN 1 ELSE 0 END +
        CASE WHEN s.MAC_PC IS NOT NULL AND LENGTH(TRIM(s.MAC_PC)) > 0 THEN 1 ELSE 0 END) as intro_completed_count
        """
        # Base query
        base_query = """
        SELECT
            s.STUDENT_ID,
            s.EMAIL_ADDRESS,
            s.NAME,
            s.LOCATION,
            s.TEAM,
            s.INTRO,
            s.TL1,
            s.TL2,
            s.TL3,
            s.MAC_PC,
            s.ACK,
            s.ON_BOARDED,
            s.PLAYED_2T1L,
            COALESCE(task_progress.tasks_completed, 0) as tasks_completed,
            COALESCE(task_progress.tasks_total, 11) as tasks_total,
            COALESCE(survey_count.survey_count, 0) as surveys_completed,
            {intro_count},
            CASE
                WHEN s.ACK = 'Y' THEN 25
                ELSE 0
            END +
            CASE
                WHEN s.TEAM IS NOT NULL AND LENGTH(TRIM(s.TEAM)) > 0 AND s.INTRO IS NOT NULL AND LENGTH(TRIM(s.INTRO)) > 0 THEN 25
                ELSE 0
            END +     
            CASE
                WHEN COALESCE(task_progress.tasks_completed, 0) = COALESCE(task_progress.tasks_total, 11) AND COALESCE(task_progress.tasks_total, 11) > 0 THEN 25
                ELSE 0
            END +
            CASE
                WHEN (COALESCE(survey_count.survey_count, 0) + COALESCE(wf.has_feedback, 0)) > 0 THEN 25
                ELSE 0
            END as overall_progress
        FROM STUDENTS s
        LEFT JOIN (
            SELECT
                STUDENT_ID,
                COUNT(*) as tasks_total,
                COUNT(CASE WHEN COMPLETED = 'Y' THEN 1 END) as tasks_completed
            FROM ONBOARDING_TASKS
            GROUP BY STUDENT_ID
        ) task_progress ON s.STUDENT_ID = task_progress.STUDENT_ID
        LEFT JOIN (
            SELECT STUDENT_ID, COUNT(*) as survey_count
            FROM SURVEY_RESPONSES
            GROUP BY STUDENT_ID
        ) survey_count ON s.STUDENT_ID = survey_count.STUDENT_ID
        LEFT JOIN (
            SELECT STUDENT_ID, 1 as has_feedback
            FROM WORKSHOP_FEEDBACK
            GROUP BY STUDENT_ID
        ) wf ON s.STUDENT_ID = wf.STUDENT_ID
        WHERE 1=1
        """

        params = {}
        conditions = []

        if location:
            conditions.append("s.LOCATION = :location")
            params["location"] = location
            
        if intro_lt is not None:
            conditions.append("""(
                CASE WHEN s.TEAM IS NOT NULL AND LENGTH(TRIM(s.TEAM)) > 0 THEN 1 ELSE 0 END +
                CASE WHEN s.INTRO IS NOT NULL AND LENGTH(TRIM(s.INTRO)) > 0 THEN 1 ELSE 0 END +
                CASE WHEN s.TL1 IS NOT NULL AND LENGTH(TRIM(s.TL1)) > 0
                        AND s.TL2 IS NOT NULL AND LENGTH(TRIM(s.TL2)) > 0
                        AND s.TL3 IS NOT NULL AND LENGTH(TRIM(s.TL3)) > 0 THEN 1 ELSE 0 END +
                CASE WHEN s.MAC_PC IS NOT NULL AND LENGTH(TRIM(s.MAC_PC)) > 0 THEN 1 ELSE 0 END
            ) <= :intro_lt""")
            params["intro_lt"] = intro_lt

        if onboarding_lt is not None:
            conditions.append("COALESCE(task_progress.tasks_completed, 0) <= :onboarding_lt")
            params["onboarding_lt"] = onboarding_lt

        if survey_lt is not None:
            conditions.append("(COALESCE(survey_count.survey_count, 0) + COALESCE(wf.has_feedback, 0)) <= :survey_lt")
            params["survey_lt"] = survey_lt

        if ack_filter and ack_filter != "any":
            ack_upper = ack_filter.upper()
            if ack_upper == "Y":
                conditions.append("s.ACK = 'Y'")
            elif ack_upper == "N":
                conditions.append("(s.ACK != 'Y' OR s.ACK IS NULL)")

        where_clause = " AND ".join(conditions) if conditions else ""

        # Sorting
        valid_sort_fields = ["s.NAME", "s.LOCATION", "overall_progress", "intro_completed_count", "tasks_completed", "surveys_completed", "s.ACK"]
        sort_field = next((field for field in valid_sort_fields if sort_by.lower() in field.lower()), "s.NAME")
        if sort_by == "name":
            sort_field = "s.NAME"
        elif sort_by == "location":
            sort_field = "s.LOCATION"
        elif sort_by == "overall_progress":
            sort_field = "overall_progress"
        elif sort_by == "intro_completed":
            sort_field = "intro_completed_count"
        elif sort_by == "onboarding_completed":
            sort_field = "tasks_completed"
        elif sort_by == "surveys_completed":
            sort_field = "surveys_completed"
        elif sort_by == "ack":
            sort_field = "s.ACK"
        else:
            sort_field = "s.NAME"

        order_by = f"ORDER BY {sort_field} {order.upper()}"

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


@router.post("/query", response_model=AdminQueryResponse)
async def execute_natural_language_query(query_request: AdminQueryRequest):
    """
    Execute natural language query converted to SQL.
    For now, return a placeholder response - full NL to SQL implementation would require LangChain setup.
    """
    try:
        # Placeholder implementation - in full implementation, this would:
        # 1. Use LangChain with OpenAI to convert NL to SQL
        # 2. Validate the generated SQL is read-only
        # 3. Execute the query safely

        query = query_request.query.lower()

        # Simple keyword-based responses for common queries
        if "completed onboarding" in query or "onboarding completed" in query:
            result = db.execute_query("""
                SELECT COUNT(*) as completed_count
                FROM STUDENTS
                WHERE ON_BOARDED = 'Y'
            """)
            count = result[0][0] if result else 0
            return AdminQueryResponse(
                query=query_request.query,
                results=[{"completed_onboarding": count}],
                summary=f"{count} attendees have completed onboarding"
            )

        elif "location" in query and "haven't finished" in query:
            # Extract location from query - simplified
            location = None
            if "austin" in query.lower():
                location = "AUS"
            elif "seattle" in query.lower():
                location = "SEA"
            # Add more location mappings as needed

            if location:
                result = db.execute_query("""
                    SELECT COUNT(*) as incomplete_count
                    FROM STUDENTS s
                    LEFT JOIN (
                        SELECT STUDENT_ID, COUNT(CASE WHEN COMPLETED = 'Y' THEN 1 END) as completed_tasks
                        FROM ONBOARDING_TASKS
                        GROUP BY STUDENT_ID
                    ) t ON s.STUDENT_ID = t.STUDENT_ID
                    WHERE s.LOCATION = :location
                    AND (s.ON_BOARDED != 'Y' OR s.ON_BOARDED IS NULL)
                """, {"location": location})
                count = result[0][0] if result else 0
                return AdminQueryResponse(
                    query=query_request.query,
                    results=[{"incomplete_from_location": count}],
                    summary=f"{count} attendees from {location} haven't finished onboarding"
                )

        elif "average rating" in query and "rag" in query.lower():
            result = db.execute_query("""
                SELECT ROUND(AVG(RATING), 1) as avg_rating, COUNT(*) as response_count
                FROM SURVEY_RESPONSES
                WHERE SURVEY_TYPE = 'rag'
            """)
            if result and result[0][0]:
                avg_rating = result[0][0]
                count = result[0][1]
                return AdminQueryResponse(
                    query=query_request.query,
                    results=[{"average_rating": float(avg_rating), "responses": count}],
                    summary=f"Average RAG session rating: {avg_rating}/5 from {count} responses"
                )

        elif "mac users" in query.lower():
            result = db.execute_query("""
                SELECT COUNT(*) as mac_users
                FROM STUDENTS
                WHERE MAC_PC = 'M'
            """)
            count = result[0][0] if result else 0
            return AdminQueryResponse(
                query=query_request.query,
                results=[{"mac_users": count}],
                summary=f"{count} attendees are Mac users"
            )

        elif "feedback mentioning" in query and "confusing" in query.lower():
            result = db.execute_query("""
                SELECT COUNT(*) as confusing_mentions
                FROM (
                    SELECT WHAT_BETTER FROM SURVEY_RESPONSES WHERE LOWER(WHAT_BETTER) LIKE '%confusing%'
                    UNION ALL
                    SELECT COMMENTS FROM SURVEY_RESPONSES WHERE LOWER(COMMENTS) LIKE '%confusing%'
                    UNION ALL
                    SELECT OVERALL_COMMENTS FROM WORKSHOP_FEEDBACK WHERE LOWER(OVERALL_COMMENTS) LIKE '%confusing%'
                )
            """)
            count = result[0][0] if result else 0
            return AdminQueryResponse(
                query=query_request.query,
                results=[{"confusing_mentions": count}],
                summary=f"{count} feedback responses mention 'confusing'"
            )

        # Default response for unrecognized queries
        return AdminQueryResponse(
            query=query_request.query,
            results=[],
            summary="Query not recognized. Try queries like 'How many people completed onboarding?' or 'Show me attendees from Austin who haven't finished'"
        )

    except Exception as e:
        logger.error(f"Error executing query '{query_request.query}': {e}")
        raise HTTPException(status_code=500, detail="Query execution failed")


@router.get("/locations")
async def get_locations():
    """
    Get list of unique locations for the game dropdown.
    """
    try:
        result = db.execute_query("""
            SELECT DISTINCT LOCATION
            FROM STUDENTS
            WHERE LOCATION IS NOT NULL
            ORDER BY LOCATION
        """)

        locations = [row[0] for row in result] if result else []
        return {"locations": locations}

    except Exception as e:
        logger.error(f"Error getting locations: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/game/progress")
async def get_game_progress(location: Optional[str] = None):
    """
    Get progress for 2 Truths and a Lie game: number played vs total attendees for a location.
    """
    try:
        if not location:
            raise HTTPException(status_code=400, detail="Location parameter required")

        # Total: all attendees in location
        total_result = db.execute_query("""
            SELECT COUNT(*) FROM STUDENTS 
            WHERE LOCATION = :location
        """, {"location": location})
        total = total_result[0][0] if total_result and len(total_result) > 0 else 0

        # Played: PLAYED_2T1L = 'Y'
        played_result = db.execute_query("""
            SELECT COUNT(*) FROM STUDENTS 
            WHERE LOCATION = :location 
            AND PLAYED_2T1L = 'Y'
        """, {"location": location})
        played_count = played_result[0][0] if played_result and len(played_result) > 0 else 0

        return {"played": played_count, "total": total, "progress": f"{played_count}/{total}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting game progress for location {location}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/game/next")
async def get_next_game_attendee(location: Optional[str] = None):
    """
    Get random unplayed attendee from specified location for 2 Truths and a Lie game.
    """
    try:
        if not location:
            raise HTTPException(status_code=400, detail="Location parameter required")

        # Get random attendee who hasn't played (all are eligible, even without statements)
        result = db.execute_query("""
            SELECT STUDENT_ID, NAME, EMAIL_ADDRESS, TEAM, LOCATION, INTRO, TL1, TL2, TL3, FACE_IMAGE
            FROM STUDENTS
            WHERE LOCATION = :location
            AND (PLAYED_2T1L IS NULL OR PLAYED_2T1L = 'N')
            ORDER BY DBMS_RANDOM.VALUE
            FETCH FIRST 1 ROW ONLY
        """, {"location": location})

        if not result:
            return {"attendee": None, "message": f"All attendees from {location} have played"}

        row = result[0]
        attendee = {
            "student_id": row[0],
            "name": row[1],
            "email_address": row[2],
            "team": row[3],
            "location": row[4],
            "intro": row[5],
            "tl1": row[6],
            "tl2": row[7],
            "tl3": row[8],
            "image_filename": row[9]
        }

        return {"attendee": attendee}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting next game attendee for location {location}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/game/played/{student_id}")
async def mark_attendee_as_played(student_id: str):
    """
    Mark attendee as having played the 2 Truths and a Lie game.
    """
    try:
        # Check if student exists
        student_check = db.execute_query(
            "SELECT STUDENT_ID FROM STUDENTS WHERE STUDENT_ID = :id",
            {"id": student_id}
        )
        if not student_check:
            raise HTTPException(status_code=404, detail="Attendee not found")

        # Update played status
        affected_rows = db.execute_dml(
            "UPDATE STUDENTS SET PLAYED_2T1L = 'Y' WHERE STUDENT_ID = :student_id",
            {"student_id": student_id}
        )

        if affected_rows == 0:
            raise HTTPException(status_code=404, detail="Attendee not found")

        return {"message": "Attendee marked as played"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking attendee {student_id} as played: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/game/reset")
async def reset_game_flags(location: Optional[str] = None):
    """
    Reset PLAYED_2T1L flags to 'N' for all attendees in a specific location.
    If no location provided, resets all attendees.
    """
    try:
        if not location:
            raise HTTPException(status_code=400, detail="Location parameter required for targeted reset. Omit for global reset.")

        # Check if location exists
        location_check = db.execute_query(
            "SELECT COUNT(*) FROM STUDENTS WHERE LOCATION = :location",
            {"location": location}
        )
        if not location_check or location_check[0][0] == 0:
            raise HTTPException(status_code=404, detail="No attendees found for the specified location")

        # Update played status to reset
        affected_rows = db.execute_dml(
            "UPDATE STUDENTS SET PLAYED_2T1L = 'N' WHERE LOCATION = :location",
            {"location": location}
        )

        return {"message": f"Reset {affected_rows} attendees from location {location} to unplayed status"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting game flags for location {location}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
