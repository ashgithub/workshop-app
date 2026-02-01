"""Survey endpoints for the rebuilt schema."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from ...services import surveys as survey_service

router = APIRouter(prefix="/surveys", tags=["surveys"])
logger = logging.getLogger(__name__)


@router.get("/templates")
async def list_templates():
    try:
        return survey_service.list_templates()
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to list survey templates: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to load surveys")


@router.get("/templates/{template_id}/questions")
async def list_questions(template_id: int):
    try:
        return survey_service.list_questions(template_id)
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to list questions for template %s: %s", template_id, exc)
        raise HTTPException(status_code=500, detail="Unable to load survey questions")


@router.get("/submissions/{attendee_id}/{template_id}")
async def get_submission(attendee_id: int, template_id: int):
    try:
        submission = survey_service.get_submission(attendee_id, template_id)
        if submission is None:
            raise HTTPException(status_code=404, detail="Submission not found")
        return submission
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to load submission: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to load submission")


@router.post("/submissions/{attendee_id}/{template_id}")
async def record_submission(attendee_id: int, template_id: int, payload: dict):
    try:
        answers = payload.get("answers", [])
        if not isinstance(answers, list):
            raise HTTPException(status_code=400, detail="Answers must be a list")
        submission_id = survey_service.record_submission(attendee_id, template_id, answers)
        return {"submission_id": submission_id}
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to record submission: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to submit survey")
