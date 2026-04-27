from pydantic import BaseModel


class WechatLoginRequest(BaseModel):
    code: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserUpdateRequest(BaseModel):
    nickname: str | None = None
    avatar: str | None = None


class UserResponse(BaseModel):
    id: str
    nickname: str
    avatar: str

    model_config = {"from_attributes": True}
