from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel

# The three independent axes a user carries (ADR 0014). Stored as strings so
# that each has room to grow its own vocabulary — `plan` above all, which will
# one day carry premium tiers — without a re-modelling of the user.
ACCOUNT_STATE_OPEN = "open"
ACCOUNT_STATE_SUSPENDED = "suspended"

ROLE_PLAYER = "player"
ROLE_ADMIN = "admin"

PLAN_FREE = "free"
PLAN_PREMIUM = "premium"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    first_name: str
    last_name: str
    hashed_password: Optional[str] = Field(default=None)
    google_id: Optional[str] = Field(default=None, unique=True, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # The three axes are separate facts with separate lifecycles (ADR 0014):
    # whether the account may be used at all, what it may govern, and what it is
    # entitled to use. None of them is carried in the session token; all are read
    # from the row on every authenticated request.
    account_state: str = Field(default=ACCOUNT_STATE_OPEN)
    role: str = Field(default=ROLE_PLAYER)
    plan: str = Field(default=PLAN_FREE)

    # Updated on both password login and the Google callback.
    last_login: Optional[datetime] = Field(default=None)

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN

    @property
    def is_suspended(self) -> bool:
        return self.account_state == ACCOUNT_STATE_SUSPENDED


# A user is entitled to know their own three axes, so the self-facing schema
# carries them. It still never carries the password hash or the Google id.
class UserRead(SQLModel):
    id: int
    email: str
    first_name: str
    last_name: str
    account_state: str
    role: str
    plan: str


# The admin listing serialises a schema of its own, distinct from the
# player-facing one, so the only way to add a sensitive field to it is to type
# it out — a deliberate act, visible in review (ADR 0014). It deliberately does
# not carry the password hash or the Google id.
class AdminUserRead(SQLModel):
    id: int
    email: str
    first_name: str
    last_name: str
    account_state: str
    role: str
    plan: str
    created_at: datetime
    last_login: Optional[datetime]


# What a row of the player list carries. It extends the safe axes-and-timestamps
# schema with the two figures that make the screen worth having (#41): how many
# Sessions the player has actually played, and when they were last active —
# `last_activity` being the most recent of any login or any game played, so an
# abandoned account reads as abandoned even if its owner never logged out.
# Like every admin schema it is spelled out field by field, so a sensitive field
# can only ever be added on purpose (ADR 0014): no password hash, no Google id.
class AdminPlayerListItem(SQLModel):
    id: int
    email: str
    first_name: str
    last_name: str
    account_state: str
    role: str
    plan: str
    created_at: datetime
    last_login: Optional[datetime]
    last_activity: Optional[datetime]
    sessions_played: int


# The paginated envelope. `total` is the count *after* the search filter, so the
# screen can render "showing 20 of 137" and page through it honestly.
class AdminPlayerPage(SQLModel):
    players: list[AdminPlayerListItem]
    total: int
    page: int
    page_size: int


# One player's own page. The same facts as a list row today; a distinct schema
# because the detail page is where later slices hang their actions (#38), and it
# should not have to change shape when they arrive.
class AdminPlayerDetail(SQLModel):
    id: int
    email: str
    first_name: str
    last_name: str
    account_state: str
    role: str
    plan: str
    created_at: datetime
    last_login: Optional[datetime]
    last_activity: Optional[datetime]
    sessions_played: int
