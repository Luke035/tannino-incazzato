"""create the audit log

The panel's append-only record (#44, ADR 0014): one row per mutation the panel
makes, capturing who acted, when, on which entity, which field, and both the
value that was there before and the value that replaced it — the answer to
"what did this say before?".

Revision ID: a1b2c3d4e5f6
Revises: e5a1c7f3b204
Create Date: 2026-08-18 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'e5a1c7f3b204'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'audit_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('actor_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('entity_type', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('field', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('previous_value', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('new_value', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_audit_log_actor_id', 'audit_log', ['actor_id'])
    op.create_index('ix_audit_log_created_at', 'audit_log', ['created_at'])
    op.create_index('ix_audit_log_entity_type', 'audit_log', ['entity_type'])
    op.create_index('ix_audit_log_entity_id', 'audit_log', ['entity_id'])


def downgrade() -> None:
    op.drop_index('ix_audit_log_entity_id', table_name='audit_log')
    op.drop_index('ix_audit_log_entity_type', table_name='audit_log')
    op.drop_index('ix_audit_log_created_at', table_name='audit_log')
    op.drop_index('ix_audit_log_actor_id', table_name='audit_log')
    op.drop_table('audit_log')
