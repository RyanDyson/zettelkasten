import json
import subprocess
from pathlib import Path

import httpx

from ..config import NOTES_DIR, settings

OLLAMA = settings.ollama_base_url

PROMPT = """You are building a Zettelkasten. Given the transcript/text below, produce JSON:
{{
  "title": "...",
  "summary": "...",
  "key_concepts": ["..."],
  "atomic_notes": [
    {{"title": "...", "body": "...", "tags": ["..."]}}
  ]
}}
Atomic notes must be small, self-contained, written in your own words. Tags are lowercase, hyphenated.

TEXT:
{text}
"""


def extract_audio(video_path: Path, out_path: Path) -> Path:
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(video_path), "-vn", "-acodec", "libmp3lame", str(out_path)],
        check=True,
        capture_output=True,
    )
    return out_path


def transcribe(audio_path: Path) -> str:
    from faster_whisper import WhisperModel

    model = WhisperModel(settings.whisper_model, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(str(audio_path))
    return "\n".join(
        f"- [{s.start:.0f}s] {s.text.strip()}" for s in segments if s.text.strip()
    )


async def ollama_json(text: str) -> dict:
    async with httpx.AsyncClient(timeout=600) as client:
        resp = await client.post(
            f"{OLLAMA}/api/generate",
            json={
                "model": settings.llm_model,
                "prompt": PROMPT.format(text=text[:20000]),
                "stream": False,
                "format": "json",
            },
        )
        resp.raise_for_status()
        return json.loads(resp.json()["response"])


async def embed(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{OLLAMA}/api/embeddings",
            json={"model": settings.embed_model, "prompt": text[:4000]},
        )
        resp.raise_for_status()
        return resp.json()["embedding"]


def write_note(note_id: str, title: str, body: str, tags: list[str], source_id: str | None) -> Path:
    path = NOTES_DIR / f"{note_id}.md"
    front = "---\n"
    front += f"title: {title}\n"
    if source_id:
        front += f"source_id: {source_id}\n"
    if tags:
        front += f"tags: [{', '.join(tags)}]\n"
    front += "---\n"
    path.write_text(front + body + "\n", encoding="utf-8")
    return path


def append_links(path: Path, linked_ids: list[str]) -> None:
    if not linked_ids:
        return
    with path.open("a", encoding="utf-8") as f:
        f.write("\nRelated: " + " ".join(f"[[{nid}]]" for nid in linked_ids) + "\n")
