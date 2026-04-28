from sqlalchemy import ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class EventVisibleGroup(TimestampMixin, Base):
    __tablename__ = "event_visible_groups"
    __table_args__ = (
        UniqueConstraint("event_id", "group_id", name="uq_event_visible_group"),
        Index("ix_event_visible_groups_group_event", "group_id", "event_id"),
    )

    event_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE")
    )
    group_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("calendar_groups.id", ondelete="CASCADE")
    )

    event = relationship("Event", back_populates="visible_groups")
    group = relationship("CalendarGroup", back_populates="visible_event_links")