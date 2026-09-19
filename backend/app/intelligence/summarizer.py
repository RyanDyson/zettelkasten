import json
import re

import httpx

from ..config import settings

PROMPT = """You are building a personal knowledge vault from one media transcript.
Return ONLY valid JSON with this schema:
{{
  "title": "document title",
  "summary": "short executive summary",
  "tags": ["lowercase-tag"],
  "concepts": [
    {{
      "canonical": "normalized concept keyword",
      "aliases": ["possible alternate names"],
      "mentions": ["exact phrases copied from transcript"],
      "confidence": 0.0
    }}
  ]
}}

Rules:
- title should be concise and specific.
- tags must be lowercase and hyphenated.
- concepts should be deduplicated and ordered by importance.
- mentions must be exact phrase candidates from transcript.
- confidence is from 0.0 to 1.0.
- no markdown or text outside JSON.

TRANSCRIPT:
{text}
"""

_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9_-]+")
_MAX_PROMPT_CHARS = 4000
_GEN_OPTIONS = {"temperature": 0, "num_predict": 450, "num_ctx": 2048}


def _parse_json_payload(raw: str) -> dict | None:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        payload = json.loads(text)
        return payload if isinstance(payload, dict) else None
    except Exception:
        pass
    match = _JSON_OBJECT_RE.search(text)
    if not match:
        return None
    try:
        payload = json.loads(match.group(0))
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def _fallback_analysis(raw_text: str) -> dict:
    text = raw_text.strip()
    if not text:
        return {"title": "Untitled Note", "summary": "", "tags": [], "concepts": []}

    sentences = _SENTENCE_SPLIT_RE.split(text)
    summary = " ".join(sentences[:2]).strip()[:360]
    title_source = sentences[0].strip() if sentences else "Untitled Note"
    title = title_source[:70] if title_source else "Untitled Note"

    tokens = [m.group(0) for m in _TOKEN_RE.finditer(text)]
    counts: dict[str, int] = {}
    for token in tokens:
        key = token.lower()
        if len(key) <= 2:
            continue
        counts[key] = counts.get(key, 0) + 1
    top_keywords = [
        token for token, _ in sorted(counts.items(), key=lambda item: item[1], reverse=True)[:8]
    ]

    concepts = [
        {
            "canonical": keyword,
            "aliases": [],
            "mentions": [keyword],
            "confidence": 0.55,
        }
        for keyword in top_keywords
    ]
    tags = [k.replace("_", "-") for k in top_keywords[:4]]

    return {
        "title": title,
        "summary": summary,
        "tags": tags,
        "concepts": concepts,
    }


def _normalize_analysis(payload: dict, raw_text: str) -> dict:
    title = str(payload.get("title", "")).strip() or "Untitled Note"
    summary = str(payload.get("summary", "")).strip()

    tags_in = payload.get("tags", [])
    if not isinstance(tags_in, list):
        tags_in = []
    tags: list[str] = []
    for tag in tags_in:
        if not isinstance(tag, str):
            continue
        normalized = "-".join(tag.lower().strip().split())
        if normalized and normalized not in tags:
            tags.append(normalized)

    concepts_in = payload.get("concepts", [])
    if not isinstance(concepts_in, list):
        concepts_in = []

    concepts: list[dict] = []
    seen = set()
    for concept in concepts_in:
        if not isinstance(concept, dict):
            continue
        canonical = str(concept.get("canonical", "")).strip()
        if not canonical:
            continue
        key = canonical.lower()
        if key in seen:
            continue

        aliases_raw = concept.get("aliases", [])
        mentions_raw = concept.get("mentions", [])
        aliases = [a.strip() for a in aliases_raw if isinstance(a, str) and a.strip()]
        mentions = [m.strip() for m in mentions_raw if isinstance(m, str) and m.strip()]

        if not mentions:
            mentions = [canonical]

        conf = concept.get("confidence", 0.5)
        try:
            confidence = max(0.0, min(1.0, float(conf)))
        except (ValueError, TypeError):
            confidence = 0.5

        concepts.append(
            {
                "canonical": canonical,
                "aliases": aliases,
                "mentions": mentions,
                "confidence": confidence,
            }
        )
        seen.add(key)
        if len(concepts) >= settings.intelligence_keyword_limit:
            break

    if not concepts:
        return _fallback_analysis(raw_text)

    if title.lower() not in {t.lower() for t in tags}:
        title_tag = "-".join(title.lower().split())[:60]
        if title_tag:
            tags = [title_tag] + tags

    return {
        "title": title,
        "summary": summary,
        "tags": tags,
        "concepts": concepts,
    }


async def generate_summary_and_keywords(raw_text: str) -> dict:
    text = raw_text.strip()
    if not text:
        return {"title": "Untitled Note", "summary": "", "tags": [], "concepts": []}

    try:
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                f"{settings.ollama_base_url}/api/generate",
                json={
                    "model": settings.llm_model,
                    "prompt": PROMPT.format(text=text[:_MAX_PROMPT_CHARS]),
                    "stream": False,
                    "format": "json",
                    "options": _GEN_OPTIONS,
                },
            )
            resp.raise_for_status()
            body = resp.json()
            payload = _parse_json_payload(body.get("response", ""))
            if payload is None:
                payload = _parse_json_payload(body.get("thinking", ""))
            if payload is None:
                raise ValueError("Model output is not parseable JSON")
    except Exception:
        return _fallback_analysis(raw_text)

    return _normalize_analysis(payload, raw_text)
