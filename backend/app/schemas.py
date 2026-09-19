from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from .models import JobStatus


class ErrorResponse(BaseModel):
    detail: str


class AcceptedJob(BaseModel):
    source_id: str
    status: JobStatus
    poll: str


class NoteSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    source_id: str | None
    title: str
    created_at: datetime


class NoteDetail(NoteSummary):
    content: str


class SourceSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    kind: str
    original_name: str
    status: JobStatus
    created_at: datetime


class SourceDetail(SourceSummary):
    error: str | None
    transcript_url: str | None


class JobDetail(BaseModel):
    source_id: str
    status: JobStatus
    error: str | None
    notes: list[NoteSummary]
    transcript_url: str | None


class Segment(BaseModel):
    start: float
    end: float
    text: str


class TranscriptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    source_id: str
    content: str
    language: str | None
    duration_seconds: float | None
    segments: list[Segment]
    model: str | None
    created_at: datetime


class HealthResponse(BaseModel):
    ok: bool
    database: Literal["ok", "unavailable"]
    worker: Literal["running", "stopped"]
