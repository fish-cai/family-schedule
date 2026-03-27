import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class EventVisibility(str, enum.Enum):
    PUBLIC = "public"
    BUSY = "busy"
    PRIVATE = "private"


class Event(TimestampMixin, Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_group_start", "group_id", "start_time"),
        Index("ix_events_creator_start", "creator_id", "start_time"),
    )

    title: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(String(1024), default="")
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    location: Mapped[str] = mapped_column(String(256), default="")
    color: Mapped[str] = mapped_column(String(7), default="")
    visibility: Mapped[EventVisibility] = mapped_column(
        Enum(EventVisibility), default=EventVisibility.PUBLIC
    )
    repeat_rule: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    group_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("calendar_groups.id"), nullable=True
    )
    creator_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    template_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id"), nullable=True
    )

    creator = relationship("User", back_populates="created_events")
    group = relationship("CalendarGroup", back_populates="events")
    reminders = relationship("Reminder", back_populates="event")
