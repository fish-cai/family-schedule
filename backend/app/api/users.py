from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.user import TokenResponse, UserResponse, WechatLoginRequest
from app.services.user_service import get_or_create_user

router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("/login", response_model=TokenResponse)
async def wechat_login(
    request: WechatLoginRequest, db: AsyncSession = Depends(get_db)
):
    if settings.DEBUG:
        # Dev mode: always mock. Real WeChat login only in production.
        openid = f"dev_{request.code}" if not request.code.startswith("dev_") else request.code
    else:
        from app.services.wechat_service import code2session
        wx_data = await code2session(request.code)
        openid = wx_data["openid"]

    user = await get_or_create_user(db, openid)
    access_token = create_access_token(data={"sub": user.openid})
    return TokenResponse(access_token=access_token)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(current_user.id),
        nickname=current_user.nickname,
        avatar=current_user.avatar,
    )
