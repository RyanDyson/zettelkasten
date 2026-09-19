from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ZK_", env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://zk:zk@localhost:5432/zk"
    data_dir: Path = Path.home() / "zettelkasten"
    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    whisper_cache_dir: str | None = None
    max_upload_mb: int = Field(default=100, ge=1, le=2048)
    max_text_chars: int = Field(default=1_000_000, ge=1)
    max_pdf_pages: int = Field(default=1000, ge=1)
    max_media_seconds: int = Field(default=7200, ge=1)
    ffmpeg_timeout_seconds: int = Field(default=600, ge=1)
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    worker_poll_seconds: float = Field(default=1, gt=0)
    intelligence_enabled: bool = True
    ollama_base_url: str = "http://localhost:11434"
    llm_model: str = "qwen2.5:7b"
    embed_model: str = "nomic-embed-text"
    intelligence_timeout_seconds: float = Field(default=180, gt=0)
    intelligence_chunk_chars: int = Field(default=3000, ge=500, le=6000)
    intelligence_relation_threshold: float = Field(default=0.75, ge=0, le=1)
    intelligence_semantic_threshold: float = Field(default=0.92, ge=0, le=1)


settings = Settings()
RAW_DIR = settings.data_dir / "raw"
TRANSCRIPTS_DIR = settings.data_dir / "transcripts"
NOTES_DIR = settings.data_dir / "notes"
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac", ".opus"}
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v"}
MEDIA_EXTENSIONS = AUDIO_EXTENSIONS | VIDEO_EXTENSIONS


def ensure_directories() -> None:
    for directory in (RAW_DIR, TRANSCRIPTS_DIR, NOTES_DIR):
        directory.mkdir(parents=True, exist_ok=True)
