"""Cohort management endpoints for the rebuilt Oracle data model."""
from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, HTTPException

from ...services import cohorts as cohort_service

router = APIRouter(prefix="/cohorts", tags=["cohorts"])
logger = logging.getLogger(__name__)


@router.get("/")
async def list_cohorts():
    try:
        return cohort_service.list_cohorts()
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to list cohorts: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to list cohorts")


@router.post("/")
async def create_cohort(payload: dict):
    try:
        cohort_id = cohort_service.create_cohort(payload)
        return {"cohort_id": cohort_id}
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to create cohort: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to create cohort")


@router.post("/{cohort_id}/attendees")
async def invite_attendee(cohort_id: int, payload: dict):
    try:
        existing = cohort_service.find_attendee_by_email(cohort_id, payload["email"])
        if existing:
            return {"attendee_id": existing["id"], "status": "existing"}

        payload = {
            "cohort_id": cohort_id,
            "email": payload["email"],
            "full_name": payload.get("full_name"),
        }
        attendee_id = cohort_service.add_attendee(payload)
        created = cohort_service.generate_attendee_tasks(attendee_id, cohort_id)
        return {"attendee_id": attendee_id, "tasks_created": created}
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to invite attendee: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to invite attendee")
