import traceback
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.agent import chat as agent_chat
from app.core.security import get_optional_user

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat_endpoint(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    user_id: Optional[UUID] = None
    if current_user:
        user_id = UUID(current_user["sub"])
    try:
        result = await agent_chat(request.message, request.conversation_id, user_id, db)
        return ChatResponse(
            conversation_id=result["conversation_id"],
            reply=result["reply"],
        )
    except Exception as e:
        body = getattr(e, "response", None)
        if body is not None:
            detail = f"{str(e)} - Body: {body.text[:500]}"
        else:
            detail = f"{str(e)}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=detail)
