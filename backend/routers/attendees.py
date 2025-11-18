"""
Attendee management router for getting and updating attendee information.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
import logging

from ..database import db
from ..config import config
from ..schemas import Student, StudentUpdate, StudentWithProgress

router = APIRouter()
logger = logging.getLogger(__name__)


def calculate_progress(student_id: str) -> dict:
    """Calculate completion progress for a student."""
    try:
        # Check ACK completion
        ack_query = "SELECT ACK FROM STUDENTS WHERE STUDENT_ID = :id"
        ack_result = db.execute_query(ack_query, {"id": student_id})
        ack_completed = ack_result and ack_result[0][0] == 'Y'

        # Check intro completion (TEAM, INTRO, TL1, TL2, TL3, MAC_PC filled)
        intro_query = "SELECT TEAM, INTRO, TL1, TL2, TL3, MAC_PC FROM STUDENTS WHERE STUDENT_ID = :id"
        intro_result = db.execute_query(intro_query, {"id": student_id})

        # Individual field completions
        team_completed = bool(intro_result and intro_result[0][0] and intro_result[0][0].strip())
        intro_text_completed = bool(intro_result and intro_result[0][1] and intro_result[0][1].strip())
        truths_completed = bool(intro_result and
                               intro_result[0][2] and intro_result[0][2].strip() and
                               intro_result[0][3] and intro_result[0][3].strip() and
                               intro_result[0][4] and intro_result[0][4].strip())
        device_completed = bool(intro_result and intro_result[0][5] and intro_result[0][5].strip())

        # Count completed intro fields
        intro_fields_completed = sum([team_completed, intro_text_completed, truths_completed, device_completed])
        intro_fields_total = 4

        # Overall intro completion
        intro_completed = intro_fields_completed == intro_fields_total

        # Check onboarding completion
        onboard_query = "SELECT COUNT(*) FROM ONBOARDING_TASKS WHERE STUDENT_ID = :id AND COMPLETED = 'Y'"
        onboard_result = db.execute_query(onboard_query, {"id": student_id})
        tasks_completed = onboard_result[0][0] if onboard_result else 0
        tasks_total = 11  # Based on the task codes in requirements

        # Check individual survey completion
        survey_types = ['onboarding', 'llms', 'rag', 'function_calling', 'agents', 'database', 'speech', 'vision', 'demos', 'dev_productivity']
        individual_surveys = {}
        for survey_type in survey_types:
            survey_check = db.execute_query(
                "SELECT COUNT(*) FROM SURVEY_RESPONSES WHERE STUDENT_ID = :id AND SURVEY_TYPE = :type",
                {"id": student_id, "type": survey_type}
            )
            individual_surveys[survey_type] = (survey_check and survey_check[0][0] > 0)

        # Check if overall workshop feedback has been submitted
        overall_feedback_check = db.execute_query(
            "SELECT COUNT(*) FROM WORKSHOP_FEEDBACK WHERE STUDENT_ID = :id",
            {"id": student_id}
        )
        overall_feedback_submitted = overall_feedback_check and overall_feedback_check[0][0] > 0

        # Overall survey completion (session surveys + overall feedback)
        surveys_completed = sum(individual_surveys.values()) + (1 if overall_feedback_submitted else 0)

        # Calculate overall progress (25% each for ACK, intro, onboarding, surveys)
        progress_score = 0
        if ack_completed:
            progress_score += 25
        if intro_completed:
            progress_score += 25
        if tasks_completed == tasks_total:
            progress_score += 25
        if surveys_completed > 0:
            progress_score += 25

        return {
            "ack_completed": ack_completed,
            "intro_completed": intro_completed,
            "intro_fields_completed": intro_fields_completed,
            "intro_fields_total": intro_fields_total,
            "intro_details": {
                "team_completed": team_completed,
                "intro_completed": intro_text_completed,
                "truths_completed": truths_completed,
                "device_completed": device_completed
            },
            "tasks_completed": tasks_completed,
            "tasks_total": tasks_total,
            "surveys_submitted": overall_feedback_submitted,  # Actually check for overall feedback
            "surveys_completed": surveys_completed,
            "surveys_total": len(survey_types) + 1,
            "overall_progress": progress_score
        }

    except Exception as e:
        logger.error(f"Error calculating progress for student {student_id}: {e}")
        return {
            "ack_completed": False,
            "intro_completed": False,
            "intro_fields_completed": 0,
            "intro_fields_total": 4,
            "intro_details": {
                "team_completed": False,
                "intro_completed": False,
                "truths_completed": False,
                "device_completed": False
            },
            "tasks_completed": 0,
            "tasks_total": 11,
            "surveys_submitted": False,
            "surveys_completed": 0,
            "surveys_total": 10,
            "overall_progress": 0
        }


@router.get("/{student_id}", response_model=StudentWithProgress)
async def get_attendee(student_id: str):
    """
    Get attendee details with progress information.
    """
    try:
        # Special case: hardcoded admin user
        if student_id == 'ADMIN_USER':
            student_data = {
                "student_id": "ADMIN_USER",
                "email_address": "ashish.ag.agarwal@oracle.com",
                "name": "Admin User",
                "location": None,
                "manager": None,
                "job_id": None,
                "intro": None,
                "tl1": None,
                "tl2": None,
                "tl3": None,
                "ack": None,
                "on_boarded": None,
                "tf": None,
                "team": None,
                "face_image": None,
                "mac_pc": None,
                "image_filename": None,
                "onboarding_comments": None,
                "played_2t1l": None,
                "created_at": None,
                "updated_at": None
            }

            # Calculate progress (admin has no progress to track)
            progress = {
                "ack_completed": False,
                "intro_completed": False,
                "intro_fields_completed": 0,
                "intro_fields_total": 4,
                "intro_details": {
                    "team_completed": False,
                    "intro_completed": False,
                    "truths_completed": False,
                    "device_completed": False
                },
                "tasks_completed": 0,
                "tasks_total": 0,
                "surveys_submitted": False,
                "surveys_completed": 0,
                "surveys_total": 10,
                "overall_progress": 100  # Admin is always "complete"
            }

            return {
                **student_data,
                "progress": progress
            }

        # Get student data from database - all columns now exist
        query = """
        SELECT s.STUDENT_ID, s.EMAIL_ADDRESS, s.NAME, s.LOCATION, s.MANAGER, s.JOB_ID,
               s.INTRO, s.TL1, s.TL2, s.TL3, s.ACK, s.ON_BOARDED, s.TF, s.TEAM, s.FACE_IMAGE,
               s.MAC_PC, s.ONBOARDING_COMMENTS, s.PLAYED_2T1L, s.CREATED_AT, s.UPDATED_AT,
               l.CODE, l.NAME AS LOCATION_NAME, l.ROOM, l.MEETING_TIME, l.AGENDA_IMAGE_PATH
        FROM STUDENTS s
        LEFT JOIN LOCATIONS l ON s.LOCATION = l.CODE
        WHERE s.STUDENT_ID = :student_id
        """

        result = db.execute_query(query, {"student_id": student_id})

        if not result:
            raise HTTPException(status_code=404, detail="Attendee not found")

        row = result[0]

        student_data = {
            "student_id": row[0],
            "email_address": row[1],
            "name": row[2],
            "location": row[3],
            "manager": row[4],
            "job_id": row[5],
            "intro": row[6],
            "tl1": row[7],
            "tl2": row[8],
            "tl3": row[9],
            "ack": row[10],
            "on_boarded": row[11],
            "tf": row[12],
            "team": row[13],
            "face_image": row[14],
            "mac_pc": row[15],
            "image_filename": row[14],  # Use FACE_IMAGE as filename
            "onboarding_comments": row[16],
            "played_2t1l": row[17],
            "created_at": row[18],
            "updated_at": row[19]
        }

        # Add location details if available
        location_code = row[20]
        if location_code:
            student_data["location"] = {
                "code": location_code,
                "name": row[21] or "Unknown",
                "room": row[22] or "TBD",
                "meeting_time": row[23] or "TBD",
                "agenda_image_path": row[24] or ""
            }
        else:
            student_data["location"] = None

        # Calculate progress
        progress = calculate_progress(student_id)

        return {
            **student_data,
            "progress": progress
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting attendee {student_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/{student_id}", response_model=StudentWithProgress)
async def update_attendee(student_id: str, update_data: StudentUpdate):
    """
    Update attendee information.
    """
    try:
        # Build dynamic update query
        update_fields = []
        params = {"student_id": student_id}

        # Map of field names to database columns
        field_mapping = {
            "name": "NAME",
            "location": "LOCATION",
            "manager": "MANAGER",
            "job_id": "JOB_ID",
            "intro": "INTRO",
            "tl1": "TL1",
            "tl2": "TL2",
            "tl3": "TL3",
            "ack": "ACK",
            "team": "TEAM",
            "mac_pc": "MAC_PC",
            "onboarding_comments": "ONBOARDING_COMMENTS"
        }

        for field, db_column in field_mapping.items():
            if getattr(update_data, field, None) is not None:
                update_fields.append(f"{db_column} = :{field}")
                params[field] = getattr(update_data, field)

        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        query = f"""
        UPDATE STUDENTS
        SET {', '.join(update_fields)}
        WHERE STUDENT_ID = :student_id
        """

        affected_rows = db.execute_dml(query, params)

        if affected_rows == 0:
            raise HTTPException(status_code=404, detail="Attendee not found")

        # Return updated attendee data
        return await get_attendee(student_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating attendee {student_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{student_id}/image")
async def get_attendee_image(student_id: str):
    """
    Serve attendee profile image from filesystem.
    """
    try:
        from fastapi.responses import FileResponse
        import os

        # Get image filename from database - use FACE_IMAGE since IMAGE_FILENAME doesn't exist
        query = "SELECT FACE_IMAGE FROM STUDENTS WHERE STUDENT_ID = :student_id"
        result = db.execute_query(query, {"student_id": student_id})

        if not result or not result[0][0]:
            # Try to serve default image - check for SVG first, then PNG
            default_svg = os.path.join(config.images_dir, "default-avatar.svg")
            if os.path.exists(default_svg):
                return FileResponse(default_svg, media_type='image/svg+xml')
            default_png = os.path.join(config.images_dir, "default-avatar.png")
            if os.path.exists(default_png):
                return FileResponse(default_png, media_type='image/png')
            raise HTTPException(status_code=404, detail="Image not found")

        filename = result[0][0]

        # Build full path to image
        image_path = os.path.join(config.images_dir, filename)

        # Check if file exists
        if not os.path.exists(image_path):
            # Try default images - SVG first, then PNG
            default_svg = os.path.join(config.images_dir, "default-avatar.svg")
            if os.path.exists(default_svg):
                return FileResponse(default_svg, media_type='image/svg+xml')
            default_png = os.path.join(config.images_dir, "default-avatar.png")
            if os.path.exists(default_png):
                return FileResponse(default_png, media_type='image/png')
            raise HTTPException(status_code=404, detail="Image not found")

        # Determine media type based on file extension
        if filename.lower().endswith('.png'):
            media_type = 'image/png'
        elif filename.lower().endswith('.jpg') or filename.lower().endswith('.jpeg'):
            media_type = 'image/jpeg'
        elif filename.lower().endswith('.gif'):
            media_type = 'image/gif'
        elif filename.lower().endswith('.svg'):
            media_type = 'image/svg+xml'
        else:
            media_type = 'image/jpeg'  # default

        return FileResponse(image_path, media_type=media_type)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting image for attendee {student_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
