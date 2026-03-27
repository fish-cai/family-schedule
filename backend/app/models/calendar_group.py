import secrets

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


def generate_invite_code() -> str:
    return secrets.token_urlsafe(6)[:6].upper()


class CalendarGroup(TimestampMixin, Base):
    __tablename__ = "calendar_groups"

    name: Mapped[str] = mapped_column(String(64))
    icon: Mapped[str] = mapped_column(String(128), default="")
    color: Mapped[str] = mapped_column(String(7), default="#4A90D9")
    description: Mapped[str] = mapped_column(String(256), default="")
    creator_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    invite_code: Mapped[str] = mapped_column(
        String(10), unique=True, index=True, default=generate_invite_code
    )
    max_members: Mapped[int] = mapped_column(Integer, default=10)

    creator = relationship("User")
    members = relationship("GroupMember", back_populates="group")
    events = relationship("Event", back_populates="group")
