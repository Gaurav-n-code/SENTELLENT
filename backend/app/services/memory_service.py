from __future__ import annotations
import json
import re
from typing import Optional, List
from uuid import UUID

import httpx
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.memory import MemoryItem

STOP_WORDS = {"what", "is", "are", "my", "your", "the", "a", "an", "in", "on", "at",
              "to", "for", "of", "and", "or", "it", "do", "does", "did", "was",
              "were", "be", "been", "have", "has", "had", "not", "no", "but",
              "with", "can", "could", "will", "would", "shall", "should", "may",
              "might", "i", "me", "we", "you", "he", "she", "they", "this", "that",
              "these", "those", "am", "about", "don", "tell", "please", "know",
              "need", "want", "like"}

EMBEDDING_MODELS = [
    "models/text-embedding-004",
    "models/gemini-embedding-1",
    "models/gemini-embedding-001",
]


def _build_extraction_prompt(message: str) -> str:
    return f"""\
Analyze the user's message and extract any notable information that should be remembered for future conversations.

Return a JSON array of objects. Each object must have:
  - "key": a short snake_case identifier (max 80 chars)
  - "value": the remembered content (max 500 chars)
  - "category": one of "preference", "fact", "style_preference"

Only include information that is:
  - Explicitly stated or strongly implied
  - Likely to be relevant in future conversations
  - A preference about how things should be done
  - A fact about a person, project, or situation

If nothing notable is said, return an empty array [].

Examples:
  User: "I hate 9 AM meetings, can we do noon instead?"
  -> [{{"key": "dislikes_9am_meetings", "value": "hates 9 AM meetings, prefers noon", "category": "preference"}}]

  User: "Project X is delayed by two weeks"
  -> [{{"key": "project_x_delay", "value": "delayed by two weeks", "category": "fact"}}]

  User: "Please respond formally to the client"
  -> [{{"key": "client_communication_style", "value": "prefers formal tone with clients", "category": "style_preference"}}]

User message: {message}
"""


EXPECTED_DIM = 768


async def _embed_text(text: str) -> Optional[List[float]]:
    for model in EMBEDDING_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/{model}:embedContent"
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    url,
                    params={"key": settings.GEMINI_API_KEY},
                    json={"model": model, "content": {"parts": [{"text": text}]}},
                )
            if resp.status_code == 200:
                data = resp.json()
                values = data["embedding"]["values"]
                if len(values) == EXPECTED_DIM:
                    return values
        except Exception:
            continue
    return None


def _extract_keywords(message: str) -> List[str]:
    words = re.findall(r"[a-zA-Z0-9_]+", message.lower())
    return [w for w in words if w not in STOP_WORDS and len(w) > 1]


async def _extract_memories_from_text(message: str) -> List[dict]:
    prompt = _build_extraction_prompt(message)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.LLM_MODEL}:generateContent"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                params={"key": settings.GEMINI_API_KEY},
                json={
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.1, "maxOutputTokens": 512},
                },
            )
        if resp.status_code != 200:
            return []
        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            text = text.rsplit("```", 1)[0]
        return json.loads(text)
    except Exception:
        return []


async def extract_and_store_memories(
    message: str,
    user_id: Optional[UUID],
    db: AsyncSession,
) -> List[MemoryItem]:
    if user_id is None:
        return []

    extracted = await _extract_memories_from_text(message)
    if not extracted:
        return []

    stored = []
    for item in extracted:
        key = item.get("key", "")
        value = item.get("value", "")
        category = item.get("category", "preference")
        if not key or not value:
            continue

        existing = await db.execute(
            select(MemoryItem).where(
                MemoryItem.user_id == user_id,
                MemoryItem.key == key,
            )
        )
        existing_row = existing.scalar_one_or_none()
        if existing_row:
            existing_row.value = value
            existing_row.category = category
            existing_row.source = "chat"
            memory = existing_row
        else:
            memory = MemoryItem(
                user_id=user_id,
                key=key,
                value=value,
                category=category,
                source="chat",
            )
            db.add(memory)

        embedding_text = f"{key}: {value}"
        embedding = await _embed_text(embedding_text)
        if embedding:
            memory.embedding = embedding

        stored.append(memory)
        await db.flush()

    return stored


async def retrieve_relevant_memories(
    message: str,
    user_id: Optional[UUID],
    db: AsyncSession,
) -> str:
    if user_id is None:
        return ""

    keywords = _extract_keywords(message)
    found_ids = set()

    keyword_results = []
    if keywords:
        conditions = [
            or_(
                MemoryItem.key.ilike(f"%{kw}%"),
                MemoryItem.value.ilike(f"%{kw}%"),
            )
            for kw in keywords
        ]
        result = await db.execute(
            select(MemoryItem).where(
                MemoryItem.user_id == user_id,
                or_(*conditions),
            ).order_by(MemoryItem.updated_at.desc()).limit(20)
        )
        keyword_results = result.scalars().all()
        for m in keyword_results:
            found_ids.add(m.id)

    embedding = await _embed_text(message)
    semantic_results = []
    if embedding and len(embedding) == EXPECTED_DIM:
        try:
            vec_str = "[" + ",".join(str(v) for v in embedding) + "]"
            stmt = select(MemoryItem).where(
                MemoryItem.user_id == user_id,
            ).order_by(
                MemoryItem.embedding.cosine_distance(vec_str)
            ).limit(10)
            sem_result = await db.execute(stmt)
            for m in sem_result.scalars().all():
                if m.id not in found_ids:
                    semantic_results.append(m)
        except Exception:
            pass

    if not keyword_results and not semantic_results:
        recent = await db.execute(
            select(MemoryItem).where(
                MemoryItem.user_id == user_id,
            ).order_by(MemoryItem.updated_at.desc()).limit(5)
        )
        recent_results = recent.scalars().all()
        if not recent_results:
            return ""
        merged = recent_results
    else:
        merged = keyword_results + semantic_results

    grouped = {}
    for m in merged:
        if m.key not in grouped:
            grouped[m.key] = m

    lines = ["Here is what I know about the user. Use this context to answer:"]
    for m in grouped.values():
        prefix = {"preference": "Preference", "fact": "Fact", "style_preference": "Style"}.get(m.category, "Info")
        lines.append(f"  - {prefix}: {m.key} = {m.value}")
    return "\n".join(lines)
