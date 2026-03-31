from datetime import datetime

from pydantic import BaseModel, Field

from app.models.event import EventVisibility


class EventCreate(BaseModel):
    title: str = Field(max_length=128)
    description: str = Field(default="", max_length=1024)
    start_time: datetime
    end_time: datetime | None = None
    is_all_day: bool = False
    location: str = Field(default="", max_length=256)
    color: str = Field(default="", max_length=7)
    visibility: EventVisibility = EventVisibility.PUBLIC
    repeat_rule: dict | None = None
    group_id: str | None = None


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=1024)
    start_time: datetime | None = None
    end_time: datetime | None = None
    is_all_day: bool | None = None
    location: str | None = Field(default=None, max_length=256)
    color: str | None = Field(default=None, max_length=7)
    visibility: EventVisibility | None = None
    repeat_rule: dict | None = None


class EventResponse(BaseModel):
    id: str
    title: str
    description: str
    start_time: datetime
    end_time: datetime | None
    is_all_day: bool
    location: str
    color: str
    visibility: str
    repeat_rule: dict | None
    group_id: str | None
    creator_id: str
    creator_nickname: str
    created_at: datetime

    model_config = {"from_attributes": True}
