from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.core.security import verify_google_token, create_access_token


async def authenticate_google_user(token: str, db: AsyncSession) -> dict:
    id_info = verify_google_token(token)
    google_id = id_info["sub"]
    email = id_info["email"]
    name = id_info.get("name", "")
    picture = id_info.get("picture", "")

    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            google_id=google_id,
            email=email,
            name=name,
            picture=picture,
        )
        db.add(user)
        await db.flush()

    access_token = create_access_token(str(user.id), user.email)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "picture": user.picture,
        },
    }
