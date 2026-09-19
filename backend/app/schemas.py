from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from .config import settings

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
    blocks: list[dict] | None = None


class NoteUpdate(BaseModel):
    content: str = Field(max_length=settings.max_text_chars)
    blocks: list[dict] | None = Field(default=None, max_length=10000)

    @field_validator("content")
    @classmethod
    def no_nul(cls, value: str) -> str:
        if "\x00" in value:
            raise ValueError("NUL characters are not supported")
        return value


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


class NoteRename(BaseModel):
    title: str = Field(min_length=1, max_length=200)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        value = value.strip()
        if not value or any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError("Enter a title without line breaks or control characters")
        return value


class NoteDeleted(BaseModel):
    id: str
    deleted: bool = True
