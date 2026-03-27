from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def get_user_by_openid(db: AsyncSession, openid: str) -> User | None:
    result = await db.execute(select(User).where(User.openid == openid))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, openid: str) -> User:
    user = User(openid=openid, nickname="微信用户")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_or_create_user(db: AsyncSession, openid: str) -> User:
    user = await get_user_by_openid(db, openid)
    if user is None:
        user = await create_user(db, openid)
    return user
