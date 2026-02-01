"""Attendee detail API for the rebuilt system."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from ...services import attendees as attendee_service

router = APIRouter(prefix="/attendees", tags=["attendees"])
logger = logging.getLogger(__name__)


@router.get("/{attendee_id}")
async def get_attendee(attendee_id: int):
    try:
        attendee = attendee_service.get_attendee(attendee_id)
        if attendee is None:
            raise HTTPException(status_code=404, detail="Attendee not found")

        progress = attendee_service.get_progress(attendee_id)
        attendee["progress"] = progress
        attendee["intros"] = attendee_service.get_intro_responses(attendee_id)
        return attendee
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to get attendee %s: %s", attendee_id, exc)
        raise HTTPException(status_code=500, detail="Unable to load attendee")
