"""add event visible groups

Revision ID: cd4f6a2b1e90
Revises: b7c3d8e91f02
Create Date: 2026-04-28 20:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "cd4f6a2b1e90"
down_revision: Union[str, None] = "b7c3d8e91f02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "event_visible_groups",
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["calendar_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "group_id", name="uq_event_visible_group"),
    )
    op.create_index(
        "ix_event_visible_groups_group_event",
        "event_visible_groups",
        ["group_id", "event_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_event_visible_groups_group_event", table_name="event_visible_groups")
    op.drop_table("event_visible_groups")