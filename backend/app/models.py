import enum
import uuid
from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    JSON,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, relationship


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class JobStatus(str, enum.Enum):
    queued = "queued"
    processing = "processing"
    done = "done"
    failed = "failed"


class Source(Base):
    __tablename__ = "sources"

    id = Column(String, primary_key=True, default=new_id)
    kind = Column(String)  # pdf | audio | video (text/video-audio retained for legacy rows)
    original_name = Column(String)
    raw_path = Column(String)
    transcript_path = Column(Text, nullable=True)
    status = Column(Enum(JobStatus), default=JobStatus.queued)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Note(Base):
    __tablename__ = "notes"

    id = Column(String, primary_key=True, default=new_id)
    source_id = Column(String, ForeignKey("sources.id", ondelete="CASCADE"), nullable=True)
    path = Column(String, nullable=False)
    title = Column(String, nullable=False)
    tags = Column(String)  # comma-separated
    summary = Column(Text, nullable=True)
    embedding = Column(Vector(768))
    created_at = Column(DateTime(timezone=True), default=utcnow)

    source = relationship("Source", backref="notes")


class NoteDocument(Base):
    """User edits are separate from immutable extracted source transcripts."""

    __tablename__ = "note_documents"
    note_id = Column(String, ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True)
    content = Column(Text, nullable=False)
    blocks = Column(JSON, nullable=True)


class Transcript(Base):
    """Additive table: existing source/note/link tables are preserved."""

    __tablename__ = "transcripts"

    source_id = Column(String, ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True)
    content = Column(Text, nullable=False)
    language = Column(String, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    segments = Column(JSON, nullable=False, default=list)
    model = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class Link(Base):
    __tablename__ = "links"

    src_id = Column(String, ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True)
    dst_id = Column(String, ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True)
    weight = Column(Float, default=1.0)
    kind = Column(String, default="similarity")  # similarity | tag

    __table_args__ = (UniqueConstraint("src_id", "dst_id", "kind"),)


# Additive schema: none of master's tables, IDs, or edited note content changes.
class IntelligenceJob(Base):
    __tablename__ = "intelligence_jobs"
    note_id = Column(String, ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True)
    status = Column(String, nullable=False, default="queued", index=True)
    error = Column(Text, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    queued_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class NoteIntelligence(Base):
    __tablename__ = "note_intelligence"
    note_id = Column(String, ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True)
    input_hash = Column(String, nullable=False)
    model = Column(String, nullable=False)
    embed_model = Column(String, nullable=False)
    version = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    chunk_count = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class Concept(Base):
    __tablename__ = "intelligence_concepts"
    key = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    aliases = Column(JSON, nullable=False, default=list)
    embedding = Column(Vector(768), nullable=False)
    embed_model = Column(String, nullable=False)


class NoteConcept(Base):
    __tablename__ = "note_concepts"
    note_id = Column(String, ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True)
    concept_key = Column(String, ForeignKey("intelligence_concepts.key", ondelete="CASCADE"), primary_key=True)
    confidence = Column(Float, nullable=False)
    mentions = Column(JSON, nullable=False, default=list)


class ChatSession(Base):
    """Additive table: persisted AI chat conversations per scope (graph or one note)."""

    __tablename__ = "chat_sessions"
    id = Column(String, primary_key=True, default=new_id)
    note_id = Column(String, ForeignKey("notes.id", ondelete="CASCADE"), nullable=True)
    title = Column(String, nullable=False, default="New chat")
    provider = Column(String, nullable=False, default="ollama")
    model = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(String, primary_key=True, default=new_id)
    session_id = Column(String, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=False)  # user | assistant
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class IntelligenceLink(Base):
    """One undirected pair, separate from legacy links and their existing constraints."""
    __tablename__ = "intelligence_links"
    src_id = Column(String, ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True)
    dst_id = Column(String, ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True)
    weight = Column(Float, nullable=False)
    concepts = Column(JSON, nullable=False)
