from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy import JSON as SAJSON
from sqlmodel import Field, SQLModel


class GameSession(SQLModel, table=True):
    __tablename__ = "game_sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    )
    game_id: str
    filter: str  # "both" | "DOC" | "DOCG"
    score: int
    max_score: int
    duration_seconds: int
    played_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SessionCardAttempt(SQLModel, table=True):
    __tablename__ = "session_card_attempts"

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(
        sa_column=Column(Integer, ForeignKey("game_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    )
    denomination_name: str
    denomination_type: str  # "DOC" | "DOCG"
    wrong_attempts: int
    result: str  # "correct" | "auto-placed"
    found_regions: List[str] = Field(default_factory=list, sa_column=Column(SAJSON, nullable=False))
    auto_placed_regions: List[str] = Field(default_factory=list, sa_column=Column(SAJSON, nullable=False))
