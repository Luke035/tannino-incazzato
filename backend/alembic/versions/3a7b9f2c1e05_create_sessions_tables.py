"""create sessions tables

Revision ID: 3a7b9f2c1e05
Revises: f191782ad98a
Create Date: 2026-05-11 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = '3a7b9f2c1e05'
down_revision: Union[str, Sequence[str], None] = 'f191782ad98a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'game_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('game_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('filter', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('score', sa.Integer(), nullable=False),
        sa.Column('max_score', sa.Integer(), nullable=False),
        sa.Column('duration_seconds', sa.Integer(), nullable=False),
        sa.Column('played_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_game_sessions_user_id', 'game_sessions', ['user_id'])

    op.create_table(
        'session_card_attempts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('denomination_name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('denomination_type', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('wrong_attempts', sa.Integer(), nullable=False),
        sa.Column('result', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('found_regions', sa.JSON(), nullable=False),
        sa.Column('auto_placed_regions', sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['game_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_session_card_attempts_session_id', 'session_card_attempts', ['session_id'])


def downgrade() -> None:
    op.drop_index('ix_session_card_attempts_session_id', table_name='session_card_attempts')
    op.drop_table('session_card_attempts')
    op.drop_index('ix_game_sessions_user_id', table_name='game_sessions')
    op.drop_table('game_sessions')
