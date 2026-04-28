from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.event import EventVisibility

VALID_FREQS = {"daily", "weekly", "monthly"}
VALID_BYDAY = {"MO", "TU", "WE", "TH", "FR", "SA", "SU"}


def _validate_repeat_rule(rule: dict | None) -> dict | None:
    if rule is None:
        return None
    freq = rule.get("freq")
    if not freq or freq not in VALID_FREQS:
        raise ValueError(f"repeat_rule.freq must be one of {VALID_FREQS}")
    if "interval" in rule and (not isinstance(rule["interval"], int) or rule["interval"] < 1):
        raise ValueError("repeat_rule.interval must be a positive integer")
    if freq == "weekly" and "byday" in rule:
        if not isinstance(rule["byday"], list) or not all(d in VALID_BYDAY for d in rule["byday"]):
            raise ValueError(f"repeat_rule.byday must be a list of {VALID_BYDAY}")
    return rule


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
    visible_group_ids: list[str] | None = None
    remind_minutes: list[int] | None = None

    @model_validator(mode="after")
    def validate_times_and_rule(self):
        if self.end_time and self.start_time and self.end_time < self.start_time:
            raise ValueError("end_time must not be earlier than start_time")
        self.repeat_rule = _validate_repeat_rule(self.repeat_rule)
        return self


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
    visible_group_ids: list[str] | None = None
    remind_minutes: list[int] | None = None

    @model_validator(mode="after")
    def validate_times_and_rule(self):
        if self.end_time and self.start_time and self.end_time < self.start_time:
            raise ValueError("end_time must not be earlier than start_time")
        if self.repeat_rule is not None:
            self.repeat_rule = _validate_repeat_rule(self.repeat_rule)
        return self


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
    visible_group_ids: list[str] = []
    creator_id: str
    creator_nickname: str
    created_at: datetime
    remind_minutes: list[int] = []

    model_config = {"from_attributes": True}
