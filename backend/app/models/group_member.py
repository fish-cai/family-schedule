import enum

from sqlalchemy import Enum, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class MemberRole(str, enum.Enum):
    CREATOR = "creator"
    ADMIN = "admin"
    MEMBER = "member"


class GroupMember(TimestampMixin, Base):
    __tablename__ = "group_members"
    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_group_user"),
    )

    group_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("calendar_groups.id")
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    role: Mapped[MemberRole] = mapped_column(
        Enum(MemberRole), default=MemberRole.MEMBER
    )

    group = relationship("CalendarGroup", back_populates="members")
    user = relationship("User", back_populates="group_memberships")
