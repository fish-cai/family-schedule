"""update existing max_members and user nicknames

Revision ID: b7c3d8e91f02
Revises: a5a2e617491d
Create Date: 2026-04-27 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b7c3d8e91f02'
down_revision: Union[str, None] = 'a5a2e617491d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Update existing groups max_members from 10 to 100
    op.execute(
        "UPDATE calendar_groups SET max_members = 100 WHERE max_members = 10"
    )
    # Clear placeholder nicknames so frontend will prompt user to set real name
    op.execute(
        "UPDATE users SET nickname = '' WHERE nickname = '微信用户'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE calendar_groups SET max_members = 10 WHERE max_members = 100"
    )
