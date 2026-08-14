"""The player list and one player's page (#41), read-only.

An Admin deciding whether an account is genuine, abandoned or worth acting on
needs two figures the raw user row does not hold: how much the player has
actually played, and when they were last active. Both are derived here from the
two games' own tables and folded onto each row.

* **Sessions played** counts *finished* runs across both games: every
  `game_sessions` row (Mappa dei Vini persists only completed runs) plus every
  *submitted* `exam_sessions` row (Promossi o Cirrotici persists a Session from
  the moment it is drawn, so only a submitted one has been played to the end).
  An abandoned or in-progress quiz Session was not a game played and is not
  counted.
* **Last activity** is the most recent of the player's last login and the times
  they last *touched* either game — and unlike "sessions played" it counts a
  quiz Session whatever its status, including one started and abandoned. The two
  figures answer different questions: "sessions played" is how much genuine play
  an account holds, while "last activity" is the last sign of life, and a player
  who opened a quiz yesterday and walked away was still here yesterday. So an
  account that plays daily but never logs out again still reads as live, and one
  that registered a year ago and never came back reads as abandoned.

Every aggregation is done in Python over rows pulled with plain `select`s — the
convention across this codebase (see `exams/stats.py`) — so the numbers are
identical on the SQLite the tests run and the PostgreSQL production runs. The
counts are gathered once for the whole page rather than per row, so the listing
issues a fixed handful of queries however long it grows.
"""
from datetime import datetime
from typing import Iterable, Optional

from sqlmodel import Session, select

from app.exams.model import STATUS_SUBMITTED, ExamSession
from app.sessions.model import GameSession
from app.users.model import User


def _max_datetime(values: Iterable[Optional[datetime]]) -> Optional[datetime]:
    present = [v for v in values if v is not None]
    return max(present) if present else None


def sessions_played_by_user(db: Session, user_ids: list[int]) -> dict[int, int]:
    """How many finished games each of these users has played, both games summed."""
    counts: dict[int, int] = {uid: 0 for uid in user_ids}
    if not user_ids:
        return counts

    game_rows = db.exec(
        select(GameSession.user_id).where(GameSession.user_id.in_(user_ids))  # type: ignore[attr-defined]
    ).all()
    for uid in game_rows:
        counts[uid] = counts.get(uid, 0) + 1

    exam_rows = db.exec(
        select(ExamSession.user_id).where(
            ExamSession.user_id.in_(user_ids),  # type: ignore[attr-defined]
            ExamSession.status == STATUS_SUBMITTED,
        )
    ).all()
    for uid in exam_rows:
        counts[uid] = counts.get(uid, 0) + 1

    return counts


def last_activity_by_user(
    db: Session, users: list[User]
) -> dict[int, Optional[datetime]]:
    """The most recent moment each user was seen: login or either game played."""
    user_ids = [u.id for u in users if u.id is not None]
    last_played: dict[int, Optional[datetime]] = {uid: None for uid in user_ids}

    if user_ids:
        for uid, played_at in db.exec(
            select(GameSession.user_id, GameSession.played_at).where(
                GameSession.user_id.in_(user_ids)  # type: ignore[attr-defined]
            )
        ).all():
            last_played[uid] = _max_datetime((last_played.get(uid), played_at))

        for uid, started_at in db.exec(
            select(ExamSession.user_id, ExamSession.started_at).where(
                ExamSession.user_id.in_(user_ids)  # type: ignore[attr-defined]
            )
        ).all():
            last_played[uid] = _max_datetime((last_played.get(uid), started_at))

    return {
        u.id: _max_datetime((u.last_login, last_played.get(u.id)))
        for u in users
        if u.id is not None
    }
