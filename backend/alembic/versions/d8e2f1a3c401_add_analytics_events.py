"""add analytics events

Revision ID: d8e2f1a3c401
Revises: cd4f6a2b1e90
Create Date: 2026-05-02 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d8e2f1a3c401"
down_revision: Union[str, None] = "cd4f6a2b1e90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "analytics_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("properties", sa.JSON(), nullable=True),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_analytics_events_user_id", "analytics_events", ["user_id"])
    op.create_index("ix_analytics_events_name", "analytics_events", ["name"])
    op.create_index(
        "ix_analytics_events_name_created", "analytics_events", ["name", "created_at"]
    )
    op.create_index(
        "ix_analytics_events_user_created", "analytics_events", ["user_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_analytics_events_user_created", "analytics_events")
    op.drop_index("ix_analytics_events_name_created", "analytics_events")
    op.drop_index("ix_analytics_events_name", "analytics_events")
    op.drop_index("ix_analytics_events_user_id", "analytics_events")
    op.drop_table("analytics_events")
