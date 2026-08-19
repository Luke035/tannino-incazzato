"""The panel's append-only audit log (#44).

Writing straight to the database gives up the half of git's value that answers
"what did this say before?". This log buys it back: one record per mutation the
panel makes, capturing who acted, when, on which entity, which field, and both
the value that was there before and the value that replaced it.

It is append-only by discipline — nothing here updates or deletes a row — and it
is deliberately generic. Every later slice that mutates anything writes to it
through `record`, rather than growing a table per kind of change.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, Session, SQLModel

# The kind of thing that was acted upon. Kept as a string, like the user axes
# (ADR 0014), so a later slice can name a new entity — a question, a game —
# without a re-modelling of the log.
ENTITY_USER = "user"

# The field of that entity that changed. These match the user axes today; later
# slices add their own.
FIELD_ACCOUNT_STATE = "account_state"
FIELD_ROLE = "role"
FIELD_PLAN = "plan"


class AuditLogEntry(SQLModel, table=True):
    __tablename__ = "audit_log"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Who acted. An admin user id; never null, because nothing writes here that
    # was not an act by an admin.
    actor_id: int = Field(index=True, foreign_key="users.id")

    # When it happened, in UTC.
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )

    # What was acted upon: an entity kind and the id of the row within it. Both
    # indexed so the panel can filter the log by entity cheaply.
    entity_type: str = Field(index=True)
    entity_id: int = Field(index=True)

    # Which field changed, and the answer to "what did this say before?" beside
    # the value that replaced it. Stored as strings: every axis is already a
    # string, and a uniform text pair keeps the log generic.
    field: str
    previous_value: Optional[str] = Field(default=None)
    new_value: Optional[str] = Field(default=None)


def record(
    db: Session,
    *,
    actor_id: int,
    entity_type: str,
    entity_id: int,
    field: str,
    previous_value: Optional[str],
    new_value: Optional[str],
) -> AuditLogEntry:
    """Append one entry. The caller owns the surrounding transaction."""
    entry = AuditLogEntry(
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        field=field,
        previous_value=previous_value,
        new_value=new_value,
    )
    db.add(entry)
    return entry


# The panel reads the log on its own schema, field by field like every admin
# schema (ADR 0014), and enriches each row with the acting admin's name and
# email so the screen need not resolve actor ids itself.
class AuditLogRead(SQLModel):
    id: int
    actor_id: int
    actor_email: Optional[str]
    actor_name: Optional[str]
    created_at: datetime
    entity_type: str
    entity_id: int
    field: str
    previous_value: Optional[str]
    new_value: Optional[str]


class AuditLogPage(SQLModel):
    entries: list[AuditLogRead]
    total: int
    page: int
    page_size: int
