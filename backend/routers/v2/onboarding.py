"""Onboarding questions endpoints for the rebuilt schema."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Path

from ...services import onboarding as onboarding_service

router = APIRouter(prefix="/onboarding", tags=["onboarding"])
logger = logging.getLogger(__name__)


@router.get("/questions")
async def list_questions(include_inactive: bool = False):
    try:
        return onboarding_service.list_questions(include_inactive)
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to list onboarding questions: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to load onboarding questions")


@router.get("/questions/{question_id}")
async def get_question(question_id: int = Path(..., ge=1)):
    try:
        question = onboarding_service.get_question(question_id)
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        return question
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to get onboarding question %s: %s", question_id, exc)
        raise HTTPException(status_code=500, detail="Unable to load question")


@router.post("/questions")
async def create_question(payload: dict):
    try:
        question_id = onboarding_service.create_question(payload)
        return {"id": question_id, "message": "Question created"}
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to create onboarding question: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to create question")


@router.put("/questions/{question_id}")
async def update_question(question_id: int = Path(..., ge=1), payload: dict = {}):
    try:
        onboarding_service.update_question(question_id, payload)
        return {"message": "Question updated"}
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to update onboarding question %s: %s", question_id, exc)
        raise HTTPException(status_code=500, detail="Unable to update question")


@router.put("/questions/reorder")
async def reorder_questions(order_map: list[dict]):
    try:
        onboarding_service.reorder_questions(order_map)
        return {"message": "Questions reordered"}
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to reorder onboarding questions: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to reorder questions")


@router.get("/attendees/{attendee_id}")
async def list_attendee_responses(attendee_id: int = Path(..., ge=1)):
    try:
        return onboarding_service.list_attendee_responses(attendee_id)
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to list onboarding responses for attendee %s: %s", attendee_id, exc)
        raise HTTPException(status_code=500, detail="Unable to load attendee responses")


@router.post("/attendees/{attendee_id}/{question_id}")
async def save_response(attendee_id: int = Path(..., ge=1), question_id: int = Path(..., ge=1), payload: dict = None):
    try:
        response_id = onboarding_service.save_response(attendee_id, question_id, payload.get("response") if payload else None)
        return {"id": response_id, "message": "Response saved"}
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to save onboarding response for attendee %s, question %s: %s", attendee_id, question_id, exc)
        raise HTTPException(status_code=500, detail="Unable to save response")