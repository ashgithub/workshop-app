"""
Pydantic schemas for API request/response validation.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


# Student/Attendee schemas
class StudentBase(BaseModel):
    email_address: EmailStr
    name: Optional[str] = None
    location: Optional[str] = Field(None, max_length=3)
    manager: Optional[str] = None
    job_id: Optional[str] = None
    intro: Optional[str] = Field(None, max_length=1000)
    tl1: Optional[str] = Field(None, max_length=500)
    tl2: Optional[str] = Field(None, max_length=500)
    tl3: Optional[str] = Field(None, max_length=500)
    ack: Optional[str] = Field(None, pattern=r'^[YN]$')
    on_boarded: Optional[str] = Field(None, pattern=r'^[YN]$')
    tf: Optional[str] = Field(None, pattern=r'^[YN]$')
    team: Optional[str] = None
    face_image: Optional[str] = None
    mac_pc: Optional[str] = Field(None, pattern=r'^[MP]$')
    tshirt_size: Optional[str] = Field(None, max_length=10)
    image_filename: Optional[str] = None
    onboarding_comments: Optional[str] = None
    played_2t1l: Optional[str] = Field('N', pattern=r'^[YN]$')


class StudentCreate(StudentBase):
    student_id: str = Field(..., max_length=50)


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = Field(None, max_length=3)
    manager: Optional[str] = None
    job_id: Optional[str] = None
    intro: Optional[str] = Field(None, max_length=1000)
    tl1: Optional[str] = Field(None, max_length=500)
    tl2: Optional[str] = Field(None, max_length=500)
    tl3: Optional[str] = Field(None, max_length=500)
    ack: Optional[str] = Field(None, pattern=r'^[YN]$')
    team: Optional[str] = None
    mac_pc: Optional[str] = Field(None, pattern=r'^[MP]$')
    tshirt_size: Optional[str] = Field(None, max_length=10)
    onboarding_comments: Optional[str] = None


class Student(StudentBase):
    student_id: str

    class Config:
        from_attributes = True


# Onboarding Tasks schemas
class TaskBase(BaseModel):
    task_code: str = Field(..., max_length=50)
    completed: str = Field('N', pattern=r'^[YN]$')


class TaskCreate(TaskBase):
    student_id: str = Field(..., max_length=50)


class TaskUpdate(BaseModel):
    completed: str = Field(..., pattern=r'^[YN]$')


class TaskCompletionUpdate(BaseModel):
    task_code: str = Field(..., max_length=50)
    completed: str = Field(..., pattern=r'^[YN]$')


class Task(BaseModel):
    task_id: int
    student_id: str
    task_code: str
    completed: str

    class Config:
        from_attributes = True


# Survey Response schemas
class SurveyResponseBase(BaseModel):
    survey_type: str
    rating: int = Field(..., ge=1, le=5)
    what_liked: Optional[str] = Field(None, max_length=2000)
    what_better: Optional[str] = Field(None, max_length=2000)
    comments: Optional[str] = None


class SurveyResponseCreate(SurveyResponseBase):
    student_id: str = Field(..., max_length=50)


class SurveyResponse(SurveyResponseBase):
    response_id: int
    student_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# Workshop Feedback schemas
class WorkshopFeedbackBase(BaseModel):
    overall_rating: int = Field(..., ge=1, le=5)
    overall_comments: Optional[str] = None
    future_ideas: Optional[str] = None


class WorkshopFeedbackCreate(WorkshopFeedbackBase):
    student_id: str = Field(..., max_length=50)


class WorkshopFeedback(WorkshopFeedbackBase):
    feedback_id: int
    student_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# Progress and summary schemas
class IntroProgress(BaseModel):
    team_completed: bool
    intro_completed: bool
    truths_completed: bool
    device_completed: bool
    tshirt_completed: bool
class ProgressInfo(BaseModel):
    ack_completed: bool
    intro_completed: bool
    intro_fields_completed: int
    intro_fields_total: int
    intro_details: IntroProgress
    tasks_completed: int
    tasks_total: int
    surveys_submitted: bool
    surveys_completed: int
    surveys_total: int
    overall_progress: int  # percentage


class Location(BaseModel):
    code: str = Field(..., max_length=3)
    name: str
    room: str
    meeting_time: str
    agenda_image_path: str

    class Config:
        from_attributes = True


class StudentWithProgress(Student):
    progress: ProgressInfo
    location: Optional[Location] = None


# Authentication schemas
class LoginRequest(BaseModel):
    email: EmailStr


class LoginResponse(BaseModel):
    student_id: str
    name: Optional[str]
    is_admin: bool = False


# Admin schemas
class AdminQueryRequest(BaseModel):
    query: str


class AdminQueryResponse(BaseModel):
    query: str
    results: List[dict]
    summary: str


class GameAttendee(BaseModel):
    student_id: str
    name: str
    tl1: str
    tl2: str
    tl3: str
    image_filename: Optional[str]


# Autocomplete response
class AutocompleteResponse(BaseModel):
    emails: List[str]
