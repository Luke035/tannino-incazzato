"""create exam tables

Promossi o Cirrotici gets its own Session tables (ADR 0008). `game_sessions`
and `session_card_attempts` are deliberately left untouched: they model a
finished run of Mappa dei Vini, while a quiz Session exists from the moment it
is drawn and has no score until it is handed in.

Revision ID: c25f8b1d4a70
Revises: b4c17d0a9e33
Create Date: 2026-08-05 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = 'c25f8b1d4a70'
down_revision: Union[str, Sequence[str], None] = 'b4c17d0a9e33'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'exam_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('mode', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('level', sa.Integer(), nullable=True),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('score', sa.Integer(), nullable=True),
        sa.Column('max_score', sa.Integer(), nullable=False),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_exam_sessions_user_id', 'exam_sessions', ['user_id'])
    op.create_index('ix_exam_sessions_status', 'exam_sessions', ['status'])

    op.create_table(
        'exam_answers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('question_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('served_options', sa.JSON(), nullable=False),
        sa.Column('answer', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('verdict', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('explanation', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.ForeignKeyConstraint(['session_id'], ['exam_sessions.id'], ondelete='CASCADE'),
        # No ondelete on the question: the bank deactivates rows, never deletes
        # them, precisely so that answers already given stay readable.
        sa.ForeignKeyConstraint(['question_id'], ['question.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_exam_answers_session_id', 'exam_answers', ['session_id'])
    op.create_index('ix_exam_answers_question_id', 'exam_answers', ['question_id'])


def downgrade() -> None:
    op.drop_index('ix_exam_answers_question_id', table_name='exam_answers')
    op.drop_index('ix_exam_answers_session_id', table_name='exam_answers')
    op.drop_table('exam_answers')
    op.drop_index('ix_exam_sessions_status', table_name='exam_sessions')
    op.drop_index('ix_exam_sessions_user_id', table_name='exam_sessions')
    op.drop_table('exam_sessions')
