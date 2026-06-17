from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.auth import GoogleAuthRequest, TokenResponse, UserResponse
from app.services.auth_service import authenticate_google_user
from app.core.security import get_current_user
from app.models.user import User
from sqlalchemy import select

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/google")
async def google_auth(request: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    result = await authenticate_google_user(request.token, db)
    return result


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user["sub"]))
    user = result.scalar_one_or_none()
    return user
