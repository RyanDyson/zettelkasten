"""Blocking processing helpers; the worker runs these outside the event loop."""
import json
import subprocess
import wave
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from ..config import settings


class ProcessingError(Exception):
    """Safe, actionable message that may be returned to the API client."""


@dataclass
class Transcription:
    content: str
    language: str | None = None
    duration_seconds: float | None = None
    segments: list[dict] = field(default_factory=list)
    model: str | None = None


def extract_pdf(path: Path) -> Transcription:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(path)
        if reader.is_encrypted:
            raise ProcessingError("Encrypted PDFs are not supported. Upload an unlocked PDF.")
        if len(reader.pages) > settings.max_pdf_pages:
            raise ProcessingError(f"PDF exceeds the {settings.max_pdf_pages} page limit.")
        pages = []
        length = 0
        for page in reader.pages:
            content = page.extract_text() or ""
            length += len(content) + 2
            if length > settings.max_text_chars:
                raise ProcessingError(f"PDF exceeds the {settings.max_text_chars} extracted character limit.")
            pages.append(content)
        text = "\n\n".join(pages).strip()
    except (PdfReadError, ValueError, KeyError) as exc:
        raise ProcessingError("Cannot read this PDF. Upload a valid, unlocked PDF.") from exc
    if not text:
        raise ProcessingError("PDF has no extractable text. Scanned PDFs require OCR, which is not supported yet.")
    if "\x00" in text:
        text = text.replace("\x00", "")
    return Transcription(text)


def extract_audio(input_path: Path, out_path: Path) -> Path:
    try:
        # Decode one extra second to reject overlong media instead of truncating it.
        subprocess.run(
            ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
             "-i", str(input_path), "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000",
             "-t", str(settings.max_media_seconds + 1), "-c:a", "pcm_s16le", str(out_path)],
            check=True, capture_output=True, timeout=settings.ffmpeg_timeout_seconds,
        )
    except FileNotFoundError as exc:
        raise ProcessingError("FFmpeg is not installed on the backend host.") from exc
    except subprocess.TimeoutExpired as exc:
        raise ProcessingError("Audio extraction timed out. Try a shorter media file.") from exc
    except subprocess.CalledProcessError as exc:
        raise ProcessingError("Cannot decode media. Upload a valid file with an audio track.") from exc
    with wave.open(str(out_path), "rb") as audio:
        duration = audio.getnframes() / audio.getframerate()
    if duration > settings.max_media_seconds:
        raise ProcessingError(f"Media exceeds the {settings.max_media_seconds} second limit.")
    return out_path


@lru_cache(maxsize=1)
def whisper_model():
    from faster_whisper import WhisperModel

    return WhisperModel(settings.whisper_model, device=settings.whisper_device,
                        compute_type=settings.whisper_compute_type,
                        download_root=settings.whisper_cache_dir)


def transcribe(audio_path: Path) -> Transcription:
    segments, info = whisper_model().transcribe(str(audio_path), vad_filter=True)
    items = [{"start": s.start, "end": s.end, "text": s.text.strip()}
             for s in segments if s.text.strip()]
    content = "\n".join(item["text"] for item in items)
    if not content:
        raise ProcessingError("No speech was detected in the media file.")
    if len(content) > settings.max_text_chars:
        raise ProcessingError("Transcript exceeds the configured character limit.")
    return Transcription(content, info.language, info.duration, items, settings.whisper_model)


def atomic_write(path: Path, content: str) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    try:
        temporary.write_text(content, encoding="utf-8")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def write_note(path: Path, title: str, content: str, source_id: str) -> None:
    # JSON string quoting is valid YAML, including quotes, colons and newlines.
    frontmatter = f"---\ntitle: {json.dumps(title, ensure_ascii=False)}\nsource_id: {source_id}\n---\n\n"
    atomic_write(path, frontmatter + content + "\n")
