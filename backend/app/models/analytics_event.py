from sqlalchemy import ForeignKey, Index, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AnalyticsEvent(TimestampMixin, Base):
    __tablename__ = "analytics_events"
    __table_args__ = (
        Index("ix_analytics_events_name_created", "name", "created_at"),
        Index("ix_analytics_events_user_created", "user_id", "created_at"),
    )

    user_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(64), index=True)
    properties: Mapped[dict | None] = mapped_column(JSON, nullable=True)
