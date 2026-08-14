"""add the three user axes and last-login

A user gains three independent axes (ADR 0014) — account state (open or
suspended), role (player or admin) and plan (free or premium) — plus a
last-login timestamp updated on both password login and the Google callback.

The three axes land NOT NULL with a server-side default so every row that
predates them backfills to the ordinary player: an open account, playing, on
the free plan. The server_default is dropped afterwards so the application, not
the schema, owns the default from here on. last_login is nullable: a user who
has never logged in since the column existed simply has no timestamp.

Revision ID: e5a1c7f3b204
Revises: d3f4a2b8c916
Create Date: 2026-08-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = 'e5a1c7f3b204'
down_revision: Union[str, Sequence[str], None] = 'd3f4a2b8c916'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'account_state',
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default='open',
        ),
    )
    op.add_column(
        'users',
        sa.Column(
            'role',
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default='player',
        ),
    )
    op.add_column(
        'users',
        sa.Column(
            'plan',
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default='free',
        ),
    )
    op.add_column(
        'users',
        sa.Column('last_login', sa.DateTime(), nullable=True),
    )

    # The default backfilled existing rows; the application owns it now. SQLite
    # cannot ALTER a column to drop a default, but it is never the production
    # database — this step matters only on Postgres, where the migration must
    # run up and down.
    if op.get_bind().dialect.name != "sqlite":
        op.alter_column('users', 'account_state', server_default=None)
        op.alter_column('users', 'role', server_default=None)
        op.alter_column('users', 'plan', server_default=None)


def downgrade() -> None:
    op.drop_column('users', 'last_login')
    op.drop_column('users', 'plan')
    op.drop_column('users', 'role')
    op.drop_column('users', 'account_state')
