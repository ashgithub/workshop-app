"""Pydantic schemas for the rebuilt workshop system."""
from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Auth & Admin
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: EmailStr
    is_admin: bool = False
    admin_password: Optional[str] = None


class LoginResponse(BaseModel):
    user_id: str
    name: Optional[str]
    is_admin: bool = False
    cohort_id: Optional[int] = None


class AdminPasswordRequest(BaseModel):
    password: str


class AdminInviteRequest(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None


class AdminUser(BaseModel):
    admin_id: int
    email: EmailStr
    full_name: Optional[str]
    is_active: bool = True


class AdminQueryRequest(BaseModel):
    query: str


class AdminQueryResponse(BaseModel):
    query: str
    sql: Optional[str] = None
    columns: List[str] = []
    results: List[dict] = []
    row_count: int = 0
    summary: str


# ---------------------------------------------------------------------------
# Cohorts & Attendees
# ---------------------------------------------------------------------------
class CohortBase(BaseModel):
    cohort_code: str
    title: str
    location_name: str
    address: Optional[str] = None
    room: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    agenda_url: Optional[str] = None


class CohortCreate(CohortBase):
    pass


class Cohort(CohortBase):
    id: int

    class Config:
        from_attributes = True


class AttendeeBase(BaseModel):
    cohort_id: int
    email: EmailStr
    full_name: Optional[str] = None


class AttendeeCreate(AttendeeBase):
    pass


class Attendee(AttendeeBase):
    id: int

    class Config:
        from_attributes = True


class AttendeeDetail(BaseModel):
    attendee_id: int
    full_name: Optional[str]
    email: EmailStr
    cohort: dict
    progress: dict
    intros: List[dict]


class IntroQuestionBase(BaseModel):
    prompt: Optional[str] = None
    display_order: Optional[int] = None
    required: Optional[bool] = None
    active: Optional[bool] = None
    question_type: Optional[str] = None
    config: Optional[dict] = None
    help_text: Optional[str] = None


class IntroQuestionCreate(IntroQuestionBase):
    code: str
    prompt: str
    display_order: int = 0
    required: bool = True
    active: bool = True
    question_type: str = "text"
    config: Optional[dict] = None
    help_text: Optional[str] = None


class IntroQuestionUpdate(IntroQuestionBase):
    code: Optional[str] = None


class IntroReorderItem(BaseModel):
    id: int
    display_order: int


class IntroReorderRequest(BaseModel):
    items: List[IntroReorderItem]


class IntroResponseUpdate(BaseModel):
    response: Optional[Any] = None


# ---------------------------------------------------------------------------
# Onboarding Tasks
# ---------------------------------------------------------------------------
class TaskTemplateBase(BaseModel):
    title: str
    description: Optional[str] = None
    instructions_url: Optional[str] = None
    required: bool = True
    display_order: int = 0


class TaskTemplate(TaskTemplateBase):
    id: int

    class Config:
        from_attributes = True


class TaskTemplateCreate(TaskTemplateBase):
    pass


class CohortTaskTemplate(BaseModel):
    id: int
    cohort_id: int
    template_id: int
    display_order: int


class AttendeeTask(BaseModel):
    id: int
    attendee_id: int
    template_id: int
    status: str
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None


class AttendeeTaskUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(PENDING|COMPLETED)$")
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Surveys
# ---------------------------------------------------------------------------
class SurveyTemplate(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    display_order: int
    active: bool = True


class SurveyQuestion(BaseModel):
    id: int
    template_id: int
    prompt: str
    question_type: str
    options: Optional[str] = None
    display_order: int = 0
    required: bool = True


class SurveyQuestionCreate(BaseModel):
    prompt: str
    question_type: str
    options: Optional[str] = None
    display_order: int = 0
    required: bool = True


class SurveySubmission(BaseModel):
    id: int
    attendee_id: int
    template_id: int
    submitted_at: datetime


class SurveyAnswer(BaseModel):
    id: int
    submission_id: int
    question_id: int
    response: Optional[str]


# ---------------------------------------------------------------------------
# Autocomplete/utility
# ---------------------------------------------------------------------------
class AutocompleteResponse(BaseModel):
    emails: List[str]
