"""create question table

Revision ID: b4c17d0a9e33
Revises: 3a7b9f2c1e05
Create Date: 2026-08-03 21:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = 'b4c17d0a9e33'
down_revision: Union[str, Sequence[str], None] = '3a7b9f2c1e05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'question',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('text', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('format', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False),
        sa.Column('reference_answer', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('options', sa.JSON(), nullable=False),
        sa.Column('explanation', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('topic', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('open_subtype', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_question_format', 'question', ['format'])
    op.create_index('ix_question_level', 'question', ['level'])
    op.create_index('ix_question_topic', 'question', ['topic'])
    op.create_index('ix_question_active', 'question', ['active'])


def downgrade() -> None:
    op.drop_index('ix_question_active', table_name='question')
    op.drop_index('ix_question_topic', table_name='question')
    op.drop_index('ix_question_level', table_name='question')
    op.drop_index('ix_question_format', table_name='question')
    op.drop_table('question')
