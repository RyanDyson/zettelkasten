import httpx

from ..config import settings


async def get_vector(text: str) -> list[float]:
    payload_text = text.strip()[:4000]
    if not payload_text:
        return [0.0] * settings.embedding_dimensions

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{settings.ollama_base_url}/api/embeddings",
            json={"model": settings.embed_model, "prompt": payload_text},
        )
        resp.raise_for_status()
        data = resp.json()

    embedding = data.get("embedding")
    if isinstance(embedding, list):
        return [float(v) for v in embedding]
    raise ValueError("Embedding payload missing 'embedding' field")
