"""
Task management router for onboarding tasks.
"""
from fastapi import APIRouter, HTTPException
from typing import List
import logging

from ..database import db
from ..schemas import Task, TaskCreate, TaskUpdate, TaskCompletionUpdate

router = APIRouter()
logger = logging.getLogger(__name__)

# Task codes as defined in requirements
TASK_CODES = [
    'tenancy_access',
    'install_uv',
    'install_vscode',
    'install_cline',
    'install_aider',
    'install_sqlcl',
    'setup_oci',
    'clone_repo',
    'uv_sync',
    'setup_env',
    'run_code'
]


@router.get("/{student_id}", response_model=List[Task])
async def get_student_tasks(student_id: str):
    """
    Get all onboarding tasks for a student.
    Creates tasks if they don't exist.
    """
    try:
        # Check if student exists
        student_check = db.execute_query(
            "SELECT STUDENT_ID FROM STUDENTS WHERE STUDENT_ID = :id",
            {"id": student_id}
        )
        if not student_check:
            raise HTTPException(status_code=404, detail="Student not found")

        # Get existing tasks
        existing_tasks = db.execute_query(
            "SELECT TASK_ID, STUDENT_ID, TASK_CODE, COMPLETED, COMPLETED_AT FROM ONBOARDING_TASKS WHERE STUDENT_ID = :id ORDER BY TASK_CODE",
            {"id": student_id}
        )

        existing_task_codes = {row[2] for row in existing_tasks} if existing_tasks else set()

        # Create missing tasks
        for task_code in TASK_CODES:
            if task_code not in existing_task_codes:
                try:
                    db.execute_dml(
                        "INSERT INTO ONBOARDING_TASKS (STUDENT_ID, TASK_CODE, COMPLETED) VALUES (:student_id, :task_code, 'N')",
                        {"student_id": student_id, "task_code": task_code}
                    )
                except Exception as e:
                    # Task might already exist due to race condition, ignore
                    logger.debug(f"Task {task_code} for student {student_id} already exists or error: {e}")

        # Get all tasks after ensuring they exist
        all_tasks = db.execute_query(
            "SELECT TASK_ID, STUDENT_ID, TASK_CODE, COMPLETED, COMPLETED_AT FROM ONBOARDING_TASKS WHERE STUDENT_ID = :id ORDER BY TASK_CODE",
            {"id": student_id}
        )

        if not all_tasks:
            raise HTTPException(status_code=500, detail="Failed to retrieve tasks")

        # Convert to Task objects
        tasks = []
        for row in all_tasks:
            task = {
                "task_id": row[0],
                "student_id": row[1],
                "task_code": row[2],
                "completed": row[3]
            }
            tasks.append(task)

        return tasks

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting tasks for student {student_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{student_id}")
async def update_task_completion(student_id: str, task_data: TaskCompletionUpdate):
    """
    Update task completion status.
    Creates task if it doesn't exist.
    """
    try:
        # Validate task code
        if task_data.task_code not in TASK_CODES:
            raise HTTPException(status_code=400, detail=f"Invalid task code: {task_data.task_code}")

        # Check if student exists
        student_check = db.execute_query(
            "SELECT STUDENT_ID FROM STUDENTS WHERE STUDENT_ID = :id",
            {"id": student_id}
        )
        if not student_check:
            raise HTTPException(status_code=404, detail="Student not found")

        # Insert or update task
        completed_at = "CURRENT_TIMESTAMP" if task_data.completed == 'Y' else None

        # Use MERGE to insert or update
        merge_query = """
        MERGE INTO ONBOARDING_TASKS t
        USING (SELECT :student_id as STUDENT_ID, :task_code as TASK_CODE FROM DUAL) s
        ON (t.STUDENT_ID = s.STUDENT_ID AND t.TASK_CODE = s.TASK_CODE)
        WHEN MATCHED THEN
            UPDATE SET t.COMPLETED = :completed,
                       t.COMPLETED_AT = CASE WHEN :completed = 'Y' THEN CURRENT_TIMESTAMP ELSE NULL END
        WHEN NOT MATCHED THEN
            INSERT (STUDENT_ID, TASK_CODE, COMPLETED, COMPLETED_AT)
            VALUES (:student_id, :task_code, :completed,
                    CASE WHEN :completed = 'Y' THEN CURRENT_TIMESTAMP ELSE NULL END)
        """

        db.execute_dml(merge_query, {
            "student_id": student_id,
            "task_code": task_data.task_code,
            "completed": task_data.completed
        })

        # Check if all tasks are completed and update ON_BOARDED flag
        all_tasks_query = """
        SELECT COUNT(*) as total, COUNT(CASE WHEN COMPLETED = 'Y' THEN 1 END) as completed
        FROM ONBOARDING_TASKS
        WHERE STUDENT_ID = :student_id
        """
        result = db.execute_query(all_tasks_query, {"student_id": student_id})
        if result and result[0][0] == result[0][1] and result[0][0] > 0:  # All tasks completed
            db.execute_dml(
                "UPDATE STUDENTS SET ON_BOARDED = 'Y' WHERE STUDENT_ID = :student_id",
                {"student_id": student_id}
            )

        return {"message": "Task updated successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating task for student {student_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
