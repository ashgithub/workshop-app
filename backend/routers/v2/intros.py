"""Intro question and response endpoints for MDC_WORKSHOP schema."""
from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, HTTPException

from ...schemas import (
    IntroQuestionCreate,
    IntroQuestionUpdate,
    IntroReorderRequest,
    IntroResponseUpdate,
)

from ...services import intros as intro_service

router = APIRouter(prefix="/intros", tags=["intros"])
logger = logging.getLogger(__name__)


@router.get("/questions")
async def list_questions(include_inactive: bool = False):
    try:
        return intro_service.list_questions(include_inactive=include_inactive)
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to list intro questions: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to load intro questions")


@router.post("/questions")
async def create_question(payload: IntroQuestionCreate):
    try:
        question_id = intro_service.create_question(payload.model_dump())
        return {"question_id": question_id}
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to create intro question: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to create intro question")


@router.put("/questions/{question_id}")
async def update_question(question_id: int, payload: IntroQuestionUpdate):
    try:
        existing = intro_service.get_question(question_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Question not found")
        intro_service.update_question(question_id, payload.model_dump(exclude_unset=True))
        return {"message": "Question updated"}
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to update intro question %s: %s", question_id, exc)
        raise HTTPException(status_code=500, detail="Unable to update intro question")


@router.post("/questions/reorder")
async def reorder_questions(payload: IntroReorderRequest):
    try:
        intro_service.reorder_questions(payload.items)
        return {"message": "Order updated"}
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to reorder intro questions: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to reorder intro questions")


@router.get("/attendees/{attendee_id}")
async def list_responses(attendee_id: int):
    try:
        return intro_service.list_attendee_responses(attendee_id)
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to list intro responses for attendee %s: %s", attendee_id, exc)
        raise HTTPException(status_code=500, detail="Unable to load intro responses")


@router.post("/attendees/{attendee_id}/{question_id}")
async def save_response(attendee_id: int, question_id: int, payload: IntroResponseUpdate):
    try:
        response_id = intro_service.save_response(attendee_id, question_id, payload.response)
        return {"response_id": response_id}
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to save intro response for attendee %s question %s: %s", attendee_id, question_id, exc)
        raise HTTPException(status_code=500, detail="Unable to save intro response")
