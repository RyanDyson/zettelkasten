import re

from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from .embedder import get_vector
from .hybrid_linker import fetch_candidate_note_relations, resolve_canonical_concept
from .summarizer import generate_concepts_from_summary, generate_summary_and_keywords
from .wordcloud import compute_tf_idf

_WIKILINK_RE = re.compile(r"\[\[[^\]]+\]\]")


def _replace_best_phrase_once(text: str, phrase: str, target_title: str) -> tuple[str, bool]:
    if not phrase.strip():
        return text, False
    link = f"[[{target_title}]]"
    pattern = re.compile(rf"\b{re.escape(phrase)}\b", flags=re.IGNORECASE)
    for match in pattern.finditer(text):
        span = match.span()
        if any(wm.start() <= span[0] < wm.end() for wm in _WIKILINK_RE.finditer(text)):
            continue
        return text[: span[0]] + link + text[span[1] :], True
    return text, False


def _relation_confidence(
    shared_concepts: int,
    concept_count: int,
    avg_matched_conf: float,
    avg_matched_score: float,
) -> float:
    if concept_count <= 0:
        return 0.0
    overlap_ratio = shared_concepts / concept_count
    raw = 0.55 * overlap_ratio + 0.30 * avg_matched_conf + 0.15 * avg_matched_score
    return max(0.0, min(1.0, raw))


async def run_intelligence_pipeline(raw_text: str, db_conn: AsyncSession) -> dict:
    analysis = await generate_summary_and_keywords(raw_text)
    ai_note_summary = analysis.get("summary", "").strip()
    summary_concepts = await generate_concepts_from_summary(ai_note_summary)
    concepts = summary_concepts or analysis.get("concepts", [])

    resolved_concepts: list[dict] = []
    for concept in concepts:
        canonical = concept.get("canonical", "")
        aliases = concept.get("aliases", [])
        mentions = concept.get("mentions", [])
        confidence = float(concept.get("confidence", 0.5))

        embedding = await get_vector(canonical)
        resolved = await resolve_canonical_concept(db_conn, canonical, aliases, embedding)

        if resolved:
            canonical_name = resolved["canonical_name"]
            match_type = resolved["match_type"]
            match_score = float(resolved["score"])
        else:
            canonical_name = canonical
            match_type = "new"
            match_score = confidence

        resolved_concepts.append(
            {
                "canonical": canonical_name,
                "source_canonical": canonical,
                "aliases": aliases,
                "mentions": mentions,
                "ai_confidence": confidence,
                "match_type": match_type,
                "match_score": match_score,
            }
        )

    concept_names = [c["canonical"] for c in resolved_concepts if c.get("canonical")]
    candidate_relations = await fetch_candidate_note_relations(db_conn, concept_names, top_k=20)

    concept_lookup = {c["canonical"].lower(): c for c in resolved_concepts if c.get("canonical")}
    relations: list[dict] = []
    for relation in candidate_relations:
        shared = int(relation["shared_concepts"])
        matched = [m for m in relation["matched_concepts"] if isinstance(m, str)]
        matched_records = [concept_lookup[m.lower()] for m in matched if m.lower() in concept_lookup]
        avg_matched_conf = (
            sum(c.get("ai_confidence", 0.5) for c in matched_records) / max(len(matched_records), 1)
        )
        avg_matched_score = (
            sum(c.get("match_score", 0.5) for c in matched_records) / max(len(matched_records), 1)
        )
        confidence = _relation_confidence(
            shared,
            max(len(concept_names), 1),
            avg_matched_conf,
            avg_matched_score,
        )
        if confidence < settings.intelligence_relation_threshold:
            continue
        relations.append(
            {
                "target_note_id": relation["note_id"],
                "target_title": relation["title"],
                "matched_concepts": relation["matched_concepts"],
                "confidence": round(confidence, 4),
            }
        )

    relations.sort(key=lambda r: r["confidence"], reverse=True)
    top_relation = relations[0] if relations else None

    linked_text = ai_note_summary or raw_text
    hyperlink_events: list[dict] = []
    if top_relation:
        matched = set(c.lower() for c in top_relation["matched_concepts"])
        best_mention = None
        best_score = -1.0
        for concept in resolved_concepts:
            if concept["canonical"].lower() not in matched:
                continue
            for mention in concept.get("mentions", []):
                if not mention.strip():
                    continue
                score = 0.6 * concept["ai_confidence"] + 0.4 * concept["match_score"]
                if score > best_score:
                    best_score = score
                    best_mention = mention

        if not best_mention:
            for concept in resolved_concepts:
                if concept["canonical"].lower() in matched:
                    best_mention = concept.get("source_canonical") or concept["canonical"]
                    break

        if best_mention:
            linked_text, replaced = _replace_best_phrase_once(
                linked_text,
                best_mention,
                top_relation["target_title"],
            )
            if replaced:
                hyperlink_events.append(
                    {
                        "phrase": best_mention,
                        "target_title": top_relation["target_title"],
                        "confidence": top_relation["confidence"],
                    }
                )

    title = analysis.get("title") or "Untitled Note"
    tags = list(dict.fromkeys([title] + analysis.get("tags", [])))
    word_frequencies = compute_tf_idf(ai_note_summary or raw_text)
    doc_embedding = await get_vector(ai_note_summary or raw_text)

    return {
        "contract_version": "intelligence.v2",
        "document": {
            "title": title,
            "summary": ai_note_summary,
            "tags": tags,
            "raw_text": raw_text,
            "summary_enriched_text": linked_text,
            "word_counts": word_frequencies,
            "embedding": doc_embedding,
        },
        "concepts": resolved_concepts,
        "relations": relations,
        "hyperlinks": hyperlink_events,
        "debug": {
            "concept_count": len(resolved_concepts),
            "summary_concepts_count": len(summary_concepts),
            "candidate_relations": len(candidate_relations),
            "accepted_relations": len(relations),
            "top_relation_confidence": relations[0]["confidence"] if relations else 0.0,
            "relation_threshold": settings.intelligence_relation_threshold,
        },
    }
