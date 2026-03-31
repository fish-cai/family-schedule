from datetime import datetime

from pydantic import BaseModel, Field


class GroupCreate(BaseModel):
    name: str = Field(max_length=64)
    icon: str = Field(default="", max_length=128)
    color: str = Field(default="#4A90D9", max_length=7)
    description: str = Field(default="", max_length=256)


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=64)
    icon: str | None = Field(default=None, max_length=128)
    color: str | None = Field(default=None, max_length=7)
    description: str | None = Field(default=None, max_length=256)


class JoinGroupRequest(BaseModel):
    invite_code: str


class GroupMemberResponse(BaseModel):
    user_id: str
    nickname: str
    avatar: str
    role: str

    model_config = {"from_attributes": True}


class GroupResponse(BaseModel):
    id: str
    name: str
    icon: str
    color: str
    description: str
    invite_code: str
    max_members: int
    member_count: int
    my_role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupDetailResponse(GroupResponse):
    members: list[GroupMemberResponse]
