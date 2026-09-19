"""Persisted AI chat over the knowledge base, grounded in note markdown and vectors."""
import asyncio
import re
import shutil
import unicodedata
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, or_, select

from ..config import settings
from ..db import SessionLocal
from ..intelligence.pipeline import IntelligenceError, get_vector, ollama
from ..models import (ChatMessage, ChatSession, Concept, Note, NoteConcept,
                      NoteDocument, Transcript)
from ..schemas import ErrorResponse

router = APIRouter(tags=["Chat"], responses={404: {"model": ErrorResponse}})

HISTORY_MESSAGES = 8
OPEN_NOTE_CHARS = 6000
CONTEXT_NOTE_CHARS = 2000
CONTEXT_TOTAL_CHARS = 9000

SYSTEM_PROMPT = """You are the assistant for a personal zettelkasten knowledge base.
Answer the question using ONLY the note excerpts below; cite note titles when useful.
If the notes do not contain the answer, say so plainly.

NOTES:
"""


class ChatProvider(BaseModel):
    id: str
    label: str
    kind: str = "local_llm"  # local_llm | agent
    available: bool = True
    models: list[str] = Field(default_factory=list)


class ProviderList(BaseModel):
    providers: list[ChatProvider]


class ChatSessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    note_id: str | None
    title: str
    provider: str
    model: str | None
    created_at: datetime


class ChatMessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime


class ChatThread(BaseModel):
    session: ChatSessionSummary
    messages: list[ChatMessageOut]


class CreateSessionRequest(BaseModel):
    note_id: str | None = None
    provider: str = "ollama"
    model: str | None = None


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)
    provider: str | None = None
    model: str | None = None


class SendMessageReply(BaseModel):
    user_message: ChatMessageOut
    assistant_message: ChatMessageOut
    context_notes: list[str] = Field(default_factory=list)


class SessionDeleted(BaseModel):
    id: str
    deleted: bool = True


@router.get("/chat/providers", response_model=ProviderList, summary="Detect available local AI providers")
async def providers():
    result: list[ChatProvider] = []
    ollama_ok = False
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            response = await client.get(f"{settings.ollama_base_url.rstrip('/')}/api/tags")
        if response.ok:
            models = [m.get("name") for m in response.json().get("models", []) if m.get("name")]
            ollama_ok = True
            result.append(ChatProvider(id="ollama", label="Ollama (local)", kind="local_llm", models=models))
    except (httpx.HTTPError, ValueError):
        pass
    if not ollama_ok:
        result.append(ChatProvider(id="ollama", label="Ollama (local)", kind="local_llm", available=False))
    # Auto-detect installed agent CLIs on PATH; they receive the same grounded prompt.
    for name, label in (("opencode", "OpenCode (agent CLI)"),):
        if shutil.which(name):
            result.append(ChatProvider(id=name, label=label, kind="agent", available=True))
    return ProviderList(providers=result)


@router.get("/chat/sessions", response_model=list[ChatSessionSummary], summary="List chat sessions, newest first")
async def list_sessions(note_id: str | None = None):
    async with SessionLocal() as session:
        query = select(ChatSession)
        if note_id:
            note = await session.get(Note, note_id)
            if note is None:
                raise HTTPException(404, "Note not found.")
            # Note-scoped chats plus general graph chats are useful for the same note.
            query = query.where(ChatSession.note_id == note_id)
        return (await session.scalars(query.order_by(ChatSession.created_at.desc(), ChatSession.id)
                                      .limit(50))).all()


@router.post("/chat/sessions", response_model=ChatSessionSummary, status_code=201,
             summary="Create a chat session scoped to one note")
async def create_session(body: CreateSessionRequest):
    async with SessionLocal() as session:
        if body.note_id and await session.get(Note, body.note_id) is None:
            raise HTTPException(404, "Note not found.")
        record = ChatSession(note_id=body.note_id or None, provider=body.provider, model=body.model)
        session.add(record)
        await session.commit()
        await session.refresh(record)
        return record


@router.get("/chat/sessions/{session_id}", response_model=ChatThread, summary="Read one chat session with its messages")
async def get_session(session_id: str):
    async with SessionLocal() as session:
        record = await session.get(ChatSession, session_id)
        if record is None:
            raise HTTPException(404, "Chat session not found.")
        messages = (await session.scalars(select(ChatMessage)
            .where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at, ChatMessage.id))).all()
        return ChatThread(session=record, messages=messages)


@router.delete("/chat/sessions/{session_id}", response_model=SessionDeleted,
               summary="Delete a chat conversation and its messages")
async def delete_session(session_id: str):
    async with SessionLocal() as session:
        record = await session.get(ChatSession, session_id)
        if record is None:
            raise HTTPException(404, "Chat session not found.")
        await session.execute(delete(ChatMessage).where(ChatMessage.session_id == session_id))
        await session.delete(record)
        await session.commit()
    return SessionDeleted(id=session_id)


async def note_content(session, note: Note) -> str:
    document = await session.get(NoteDocument, note.id)
    if document is not None:
        return document.content
    transcript = await session.get(Transcript, note.source_id) if note.source_id else None
    if transcript is not None:
        return transcript.content
    try:
        return await asyncio.to_thread(Path(note.path).read_text, encoding="utf-8")
    except OSError:
        return ""


async def retrieved_notes(session, query: str, query_vector: list[float] | None) -> list[Note]:
    """Vector similarity first (note embeddings, then concept links), keyword search as fallback."""
    hits: list[Note] = []
    if query_vector is not None and any(query_vector):
        rows = (await session.execute(
            select(Note, Note.embedding.cosine_distance(query_vector).label("distance"))
            .where(Note.embedding.is_not(None)).order_by("distance").limit(4))).all()
        hits = [note for note, _ in rows]
        concept_rows = (await session.execute(
            select(Concept, Concept.embedding.cosine_distance(query_vector).label("distance"))
            .where(Concept.embed_model == settings.embed_model).order_by("distance").limit(6))).all()
        keys = [concept.key for concept, _ in concept_rows]
        if keys:
            linked = (await session.scalars(
                select(Note).join(NoteConcept, NoteConcept.note_id == Note.id)
                .where(NoteConcept.concept_key.in_(keys), ~Note.id.in_([n.id for n in hits]))
                .order_by(NoteConcept.confidence.desc()).limit(4))).all()
            hits.extend(linked)
    if not hits:
        terms = [t for t in re.split(r"\W+", unicodedata.normalize("NFKC", query).casefold()) if len(t) >= 3][:6]
        if terms:
            matches = ([func.coalesce(Note.title, "").ilike(f"%{term}%") for term in terms]
                       + [func.coalesce(Note.summary, "").ilike(f"%{term}%") for term in terms]
                       + [NoteDocument.content.ilike(f"%{term}%") for term in terms])
            hits = list((await session.scalars(
                select(Note).join(NoteDocument, NoteDocument.note_id == Note.id, isouter=True)
                .where(or_(*matches)).order_by(Note.created_at.desc()).limit(4))).all())
    seen, unique = set(), []
    for note in hits:
        if note.id not in seen:
            seen.add(note.id)
            unique.append(note)
    return unique[:6]


async def build_context(session, note_id: str | None, query: str, query_vector: list[float] | None):
    """Return (blocks, titles, concept names): the open note's markdown, then retrieved notes."""
    blocks: list[str] = []
    titles: list[str] = []
    anchored = None
    anchored_note = None
    if note_id:
        anchored_note = await session.get(Note, note_id)
        if anchored_note is not None:
            anchored = await note_content(session, anchored_note)[:OPEN_NOTE_CHARS]
            titles.append(anchored_note.title)
            blocks.append(f"[{anchored_note.title}]\n{anchored}")
    budget = CONTEXT_TOTAL_CHARS - len(anchored or "")
    note_id_value = anchored_note.id if anchored_note else None
    for note in [n for n in await retrieved_notes(session, query, query_vector) if n.id != note_id_value]:
        titles.append(note.title)
        text = (await note_content(session, note))[:CONTEXT_NOTE_CHARS]
        blocks.append(f"[{note.title}]\n{text}")
        budget -= len(text)
        if budget <= 0:
            break
    concept_names: list[str] = []
    if note_id_value:
        concept_names = (await session.scalars(
            select(Concept.name).join(NoteConcept, NoteConcept.concept_key == Concept.key)
            .where(NoteConcept.note_id == note_id_value).limit(8))).all()
    return blocks, titles, list(concept_names)


async def generate_reply(provider: str, model: str | None, prompt: str) -> str:
    if provider == "ollama":
        async with httpx.AsyncClient(timeout=settings.intelligence_timeout_seconds) as client:
            body = await ollama(client, "generate", {
                "model": model or settings.llm_model, "prompt": prompt, "stream": False,
                "options": {"temperature": 0.3, "num_ctx": 8192},
            })
        reply = body.get("response", "")
        if not reply.strip():
            raise IntelligenceError("Ollama returned an empty reply. Retry with another message.")
        return reply.strip()
    # Agent CLIs (e.g. OpenCode) run the prompt non-interactively through the local agent.
    binary = shutil.which(provider)
    if binary is None:
        raise IntelligenceError("This agent is no longer installed. Pick another provider.")
    process = await asyncio.create_subprocess_exec(
        binary, "run", prompt, cwd=str(settings.data_dir),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), settings.intelligence_timeout_seconds)
    except TimeoutError:
        process.kill()
        raise IntelligenceError("The agent took too long to answer. Retry or pick a different provider.")
    if process.returncode != 0 or not stdout.strip():
        detail = stderr.decode(errors="replace").strip()[:300]
        raise IntelligenceError(f"Agent failed (exit {process.returncode}). {detail}")
    return stdout.decode(errors="replace").strip()


@router.post("/chat/sessions/{session_id}/messages", response_model=SendMessageReply,
             responses={502: {"model": ErrorResponse, "description": "AI provider unavailable"}},
             summary="Send a message; context is retrieved from vectors and note markdown, and both messages are stored")
async def send_message(session_id: str, body: SendMessageRequest):
    async with SessionLocal() as session:
        thread = await session.get(ChatSession, session_id)
        if thread is None:
            raise HTTPException(404, "Chat session not found.")
        provider = body.provider or thread.provider or "ollama"
        model = body.model or thread.model
        history = (await session.scalars(select(ChatMessage).where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc()).limit(HISTORY_MESSAGES))).all()
        embed_client = httpx.AsyncClient(timeout=settings.intelligence_timeout_seconds)
        try:
            query_vector = await get_vector(embed_client, body.content)
        except (IntelligenceError, httpx.HTTPError):
            query_vector = None  # Keyword retrieval still grounds the answer without embeddings.
        finally:
            await embed_client.aclose()
        blocks, titles, concept_names = await build_context(session, thread.note_id, body.content, query_vector)
        transcript_lines = []
        for message in reversed(history):
            transcript_lines.append(f"{'USER' if message.role == 'user' else 'ASSISTANT'}: {message.content}")
        prompt = ("".join(block + "\n\n" for block in blocks)
                  + (f"NOTE CONCEPTS: {', '.join(concept_names)}\n\n" if concept_names else "")
                  + (f"CONVERSATION:\n" + "\n".join(transcript_lines) + "\n\n" if transcript_lines else "")
                  + f"QUESTION: {body.content}")
        user_message = ChatMessage(session_id=session_id, role="user", content=body.content)
        session.add(user_message)
        try:
            reply = await generate_reply(provider, model, SYSTEM_PROMPT + prompt)
        except IntelligenceError as exc:
            await session.commit()  # Keep the user message even when the provider fails.
            raise HTTPException(502, str(exc)) from exc
        if thread.title == "New chat" and len(body.content) >= 8:
            thread.title = body.content[:60].splitlines()[0]
        thread.provider, thread.model = provider, model
        assistant_message = ChatMessage(session_id=session_id, role="assistant", content=reply)
        session.add(assistant_message)
        await session.commit()
        await session.refresh(user_message)
        await session.refresh(assistant_message)
        return SendMessageReply(user_message=user_message, assistant_message=assistant_message,
                                context_notes=titles[:6])
