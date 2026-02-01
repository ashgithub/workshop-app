"""Attendee onboarding task endpoints for the rebuilt schema."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Path

from ...services import cohorts as cohort_service

router = APIRouter(prefix="/tasks", tags=["tasks"])
logger = logging.getLogger(__name__)


@router.get("/attendees/{attendee_id}")
async def list_tasks(attendee_id: int = Path(..., ge=1)):
    try:
        return cohort_service.list_attendee_tasks(attendee_id)
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to list tasks for attendee %s: %s", attendee_id, exc)
        raise HTTPException(status_code=500, detail="Unable to load attendee tasks")


@router.put("/attendees/{attendee_id}/{task_id}")
async def update_task(attendee_id: int, task_id: int, payload: dict):
    try:
        status = payload.get("status")
        notes = payload.get("notes")
        if status not in {"PENDING", "COMPLETED"}:
            raise HTTPException(status_code=400, detail="Invalid status")

        cohort_service.update_attendee_task(task_id, status, notes)

        if status == "COMPLETED":
            cohort_service.generate_attendee_tasks(attendee_id, payload.get("cohort_id", 0))

        return {"message": "Task updated"}
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to update task %s: %s", task_id, exc)
        raise HTTPException(status_code=500, detail="Unable to update task")
