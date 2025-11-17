"""
Survey management router for session surveys and workshop feedback.
"""
from fastapi import APIRouter, HTTPException
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

        # Insert survey response
        insert_query = """
        INSERT INTO SURVEY_RESPONSES (
            STUDENT_ID, SURVEY_TYPE, RATING, WHAT_LIKED, WHAT_BETTER, COMMENTS
        ) VALUES (
            :student_id, :survey_type, :rating, :what_liked, :what_better, :comments
        )
        """

        db.execute_dml(insert_query, {
            "student_id": survey_data.student_id,
            "survey_type": survey_data.survey_type,
            "rating": survey_data.rating,
            "what_liked": survey_data.what_liked,
            "what_better": survey_data.what_better,
            "comments": survey_data.comments
        })

        return {"message": "Survey response submitted successfully"}

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
