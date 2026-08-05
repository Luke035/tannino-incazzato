"""one exam session in progress per user

A player has at most one Session in progress at a time, across every mode of
the game (#21). The router checks before it draws, but a check followed by an
insert is not a rule: two taps in two tabs both pass it. A partial unique index
is what a race cannot get past.

Rows that predate the rule can already break it — before this, nothing stopped
a player leaving any number of papers open — so the most recent open paper per
player is kept and the rest are marked abandoned. Abandoned is not a loss: the
questions stay on record, the paper simply is not the one in progress.

Revision ID: d3f4a2b8c916
Revises: c25f8b1d4a70
Create Date: 2026-08-05 16:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd3f4a2b8c916'
down_revision: Union[str, Sequence[str], None] = 'c25f8b1d4a70'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = 'uq_exam_sessions_one_in_progress_per_user'


def upgrade() -> None:
    op.execute(
        """
        UPDATE exam_sessions SET status = 'abandoned'
        WHERE status = 'in_progress'
          AND id NOT IN (
              SELECT MAX(id) FROM exam_sessions
              WHERE status = 'in_progress'
              GROUP BY user_id
          )
        """
    )
    op.create_index(
        INDEX_NAME,
        'exam_sessions',
        ['user_id'],
        unique=True,
        postgresql_where=sa.text("status = 'in_progress'"),
        sqlite_where=sa.text("status = 'in_progress'"),
    )


def downgrade() -> None:
    # The papers marked abandoned on the way up stay abandoned: which of a
    # player's open papers was the live one is not recoverable, and guessing
    # would hand somebody back a Session they had already left behind.
    op.drop_index(INDEX_NAME, table_name='exam_sessions')
