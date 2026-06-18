from __future__ import annotations
from typing import Optional, Dict, List, Tuple
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.conversation import Conversation, Message
from app.services.memory_service import extract_and_store_memories, retrieve_relevant_memories

conversation_histories: Dict[str, List[dict]] = {}


async def _call_gemini(
    message: str,
    history: List[dict],
    memory_context: str = "",
) -> Tuple[str, List[dict]]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.LLM_MODEL}:generateContent"
    contents = list(history)

    augmented_message = message
    if memory_context:
        augmented_message = f"{memory_context}\n\nThe user says: {message}"

    contents.append({"role": "user", "parts": [{"text": augmented_message}]})

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            url,
            params={"key": settings.GEMINI_API_KEY},
            json={"contents": contents},
        )
    data = resp.json()
    if "candidates" not in data:
        raise Exception(f"Gemini returned no candidates. Full response: {data}")
    reply = data["candidates"][0]["content"]["parts"][0]["text"]
    new_history = list(contents)
    new_history.append({
        "role": "model",
        "parts": [{"text": reply}],
    })
    return reply, new_history


async def _call_openai(message: str, history: List[dict], memory_context: str = "") -> str:
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

    llm = ChatOpenAI(
        model=settings.LLM_MODEL,
        api_key=settings.OPENAI_API_KEY,
        temperature=0.7,
    )
    messages = []
    if memory_context:
        messages.append(SystemMessage(content=memory_context))
    for h in history:
        if h["role"] == "user":
            messages.append(HumanMessage(content=h["parts"][0]["text"]))
        else:
            messages.append(AIMessage(content=h["parts"][0]["text"]))
    messages.append(HumanMessage(content=message))
    response = await llm.ainvoke(messages)
    return response.content


async def chat(
    message: str,
    conversation_id: Optional[str],
    user_id: Optional[UUID],
    db: AsyncSession,
) -> dict:
    if conversation_id:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conversation = result.scalar_one_or_none()
        if not conversation:
            conversation = Conversation(title=message[:50], user_id=user_id)
            db.add(conversation)
            await db.flush()
    else:
        conversation = Conversation(title=message[:50], user_id=user_id)
        db.add(conversation)
        await db.flush()

    user_msg = Message(
        conversation_id=conversation.id,
        role="user",
        content=message,
    )
    db.add(user_msg)
    await db.flush()

    memory_context = await retrieve_relevant_memories(message, user_id, db)

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at)
    )
    history = result.scalars().all()

    langchain_history = []
    for msg in history[:-1]:
        role = "model" if msg.role == "assistant" else msg.role
        langchain_history.append({"role": role, "parts": [{"text": msg.content}]})

    cid = str(conversation.id)

    if settings.LLM_PROVIDER == "gemini":
        reply, _ = await _call_gemini(message, langchain_history, memory_context)
    elif settings.LLM_PROVIDER == "openai":
        reply = await _call_openai(message, langchain_history, memory_context)
    else:
        raise ValueError(f"Unsupported LLM provider: {settings.LLM_PROVIDER}")

    _ = await extract_and_store_memories(message, user_id, db)

    assistant_msg = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=reply,
    )
    db.add(assistant_msg)
    await db.flush()

    return {
        "conversation_id": cid,
        "reply": reply,
    }
