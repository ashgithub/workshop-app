"""
Survey management router for session surveys and workshop feedback.
"""
from fastapi import APIRouter, HTTPException, Query
import logging

from ..database import db
from ..schemas import SurveyResponseCreate, WorkshopFeedbackCreate

router = APIRouter()
logger = logging.getLogger(__name__)

# Valid survey types
SURVEY_TYPES = [
    'onboarding', 'llms', 'rag', 'function_calling', 'agents',
    'database', 'speech', 'vision', 'demos', 'dev_productivity'
]


@router.get("/")
async def get_session_survey(student_id: str = Query(...), survey_type: str = Query(...)):
    """
    Get a previously submitted session survey response for a student and survey type.
    """
    try:
        query = """
        SELECT RATING, WHAT_LIKED, WHAT_BETTER, COMMENTS
        FROM SURVEY_RESPONSES
        WHERE STUDENT_ID = :student_id AND SURVEY_TYPE = :survey_type
        """
        row = db.execute_query(query, {"student_id": student_id, "survey_type": survey_type})
        if not row:
            return {}
        return {
            "rating": row[0][0],
            "what_liked": row[0][1],
            "what_better": row[0][2],
            "comments": row[0][3],
        }
    except Exception as e:
        logger.error(f"Error getting survey for student {student_id}, type {survey_type}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/")
async def submit_session_survey(survey_data: SurveyResponseCreate):
    """
    Submit a session survey response.
    """
    try:
        # Validate survey type
        if survey_data.survey_type not in SURVEY_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid survey type: {survey_data.survey_type}")

        # Check if student exists
        student_check = db.execute_query(
            "SELECT STUDENT_ID FROM STUDENTS WHERE STUDENT_ID = :id",
            {"id": survey_data.student_id}
        )
        if not student_check:
            raise HTTPException(status_code=404, detail="Student not found")

        # UPSERT survey response (update if exists, insert if not)
        merge_query = """
        MERGE INTO SURVEY_RESPONSES t
        USING (SELECT :student_id as STUDENT_ID, :survey_type as SURVEY_TYPE FROM DUAL) s
        ON (t.STUDENT_ID = s.STUDENT_ID AND t.SURVEY_TYPE = s.SURVEY_TYPE)
        WHEN MATCHED THEN
            UPDATE SET t.RATING = :rating, t.WHAT_LIKED = :what_liked, t.WHAT_BETTER = :what_better, t.COMMENTS = :comments
        WHEN NOT MATCHED THEN
            INSERT (STUDENT_ID, SURVEY_TYPE, RATING, WHAT_LIKED, WHAT_BETTER, COMMENTS)
            VALUES (:student_id, :survey_type, :rating, :what_liked, :what_better, :comments)
        """
        db.execute_dml(merge_query, {
            "student_id": survey_data.student_id,
            "survey_type": survey_data.survey_type,
            "rating": survey_data.rating,
            "what_liked": survey_data.what_liked,
            "what_better": survey_data.what_better,
            "comments": survey_data.comments
        })

        return {"message": "Survey response updated successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting survey for student {survey_data.student_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/overall")
async def submit_workshop_feedback(feedback_data: WorkshopFeedbackCreate):
    """
    Submit overall workshop feedback.
    """
    try:
        # Check if student exists
        student_check = db.execute_query(
            "SELECT STUDENT_ID FROM STUDENTS WHERE STUDENT_ID = :id",
            {"id": feedback_data.student_id}
        )
        if not student_check:
            raise HTTPException(status_code=404, detail="Student not found")

        # Insert workshop feedback
        insert_query = """
        INSERT INTO WORKSHOP_FEEDBACK (
            STUDENT_ID, OVERALL_RATING, OVERALL_COMMENTS, FUTURE_IDEAS
        ) VALUES (
            :student_id, :overall_rating, :overall_comments, :future_ideas
        )
        """

        db.execute_dml(insert_query, {
            "student_id": feedback_data.student_id,
            "overall_rating": feedback_data.overall_rating,
            "overall_comments": feedback_data.overall_comments,
            "future_ideas": feedback_data.future_ideas
        })

        return {"message": "Workshop feedback submitted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting feedback for student {feedback_data.student_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
