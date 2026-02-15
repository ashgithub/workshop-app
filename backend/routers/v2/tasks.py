"""Task template endpoints.

The admin UI expects `/api/tasks/templates`.

These templates correspond to onboarding task templates (ONBOARDING_TASK_TEMPLATES)
in the rebuilt schema.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from ...services import cohorts as cohort_service

router = APIRouter(prefix="/tasks", tags=["tasks"])
logger = logging.getLogger(__name__)


@router.get("/templates")
async def list_task_templates():
    """List onboarding task templates."""
    try:
        return cohort_service.list_task_templates()
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to list task templates: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to load task templates")
