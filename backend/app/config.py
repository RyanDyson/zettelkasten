from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://zk:zk@localhost:5432/zk"
    ollama_base_url: str = "http://localhost:11434"
    llm_model: str = "qwen2.5:7b"
    embed_model: str = "nomic-embed-text"
    whisper_model: str = "base.en"
    data_dir: Path = Path.home() / "zettelkasten"
    link_threshold: float = 0.75
    top_k: int = 10
    embedding_dimensions: int = 768
    intelligence_similarity_threshold: float = 0.80
    intelligence_keyword_limit: int = 25
    intelligence_wordcloud_limit: int = 75
    intelligence_relation_threshold: float = 0.72

    class Config:
        env_prefix = "ZK_"


settings = Settings()

RAW_DIR = settings.data_dir / "raw"
TRANSCRIPTS_DIR = settings.data_dir / "transcripts"
NOTES_DIR = settings.data_dir / "notes"
CONTRACTS_DIR = settings.data_dir / "contracts"

for d in (RAW_DIR, TRANSCRIPTS_DIR, NOTES_DIR, CONTRACTS_DIR):
    d.mkdir(parents=True, exist_ok=True)

MEDIA_EXTENSIONS = {".mp4", ".mkv", ".webm", ".mov", ".avi", ".mp3", ".wav", ".m4a", ".flac", ".ogg"}
