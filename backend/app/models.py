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
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, relationship


def new_id() -> str:
    return uuid.uuid4().hex[:12]


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
    kind = Column(String)  # video | audio | text
    original_name = Column(String)
    raw_path = Column(String)
    transcript_path = Column(Text, nullable=True)
    intelligence_path = Column(Text, nullable=True)
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
    keywords = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    source = relationship("Source", backref="notes")


class Link(Base):
    __tablename__ = "links"

    src_id = Column(String, ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True)
    dst_id = Column(String, ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True)
    weight = Column(Float, default=1.0)
    kind = Column(String, default="similarity")  # similarity | tag

    __table_args__ = (UniqueConstraint("src_id", "dst_id", "kind"),)
