from datetime import datetime, timezone
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth.deps import require_active_user
from app.auth.jwt import get_current_user_id
from app.database import get_session
from app.denominations.model import Denomination
from app.sessions.model import GameSession, SessionCardAttempt

router = APIRouter(tags=["sessions"], dependencies=[Depends(require_active_user)])

GAME_ID = "mappa-vini"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _score_for_card(wrong_attempts: int, result: str) -> int:
    if result == "auto-placed":
        return 0
    if wrong_attempts == 0:
        return 3
    if wrong_attempts == 1:
        return 2
    if wrong_attempts == 2:
        return 1
    return 0


# ── Request / Response schemas ────────────────────────────────────────────────

class CardAttemptIn(BaseModel):
    denominationName: str
    denominationType: str
    wrongAttempts: int
    result: str
    foundRegions: List[str]
    autoPlacedRegions: List[str]


class SaveSessionRequest(BaseModel):
    gameId: str
    filter: str
    startedAt: datetime
    history: List[CardAttemptIn]


class SessionSummary(BaseModel):
    id: int
    filter: str
    score_pct: float
    items: int
    duration_seconds: int
    played_at: datetime


class BestSessionInfo(BaseModel):
    played_at: datetime
    filter: str


class AggregateStats(BaseModel):
    total_sessions: int
    avg_score_pct: float
    best_score_pct: float
    best_session: Optional[BestSessionInfo]
    unique_denoms: int
    total_denoms: int


class TypePerformance(BaseModel):
    doc_pct: Optional[float]
    docg_pct: Optional[float]


class RegionStat(BaseModel):
    region: str
    score_pct: float


class SessionStatsResponse(BaseModel):
    sessions: List[SessionSummary]
    aggregate: AggregateStats
    type_performance: TypePerformance
    top_regions: List[RegionStat]
    low_regions: List[RegionStat]


# ── POST /session ─────────────────────────────────────────────────────────────

@router.post("/session", status_code=201)
def save_session(
    body: SaveSessionRequest,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    if not body.history:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="empty_history")

    score = sum(_score_for_card(c.wrongAttempts, c.result) for c in body.history)
    max_score = len(body.history) * 3

    started = body.startedAt
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    duration_seconds = max(0, int((datetime.now(timezone.utc) - started).total_seconds()))

    session = GameSession(
        user_id=user_id,
        game_id=body.gameId,
        filter=body.filter,
        score=score,
        max_score=max_score,
        duration_seconds=duration_seconds,
    )
    db.add(session)
    db.flush()

    for card in body.history:
        db.add(SessionCardAttempt(
            session_id=session.id,
            denomination_name=card.denominationName,
            denomination_type=card.denominationType,
            wrong_attempts=card.wrongAttempts,
            result=card.result,
            found_regions=card.foundRegions,
            auto_placed_regions=card.autoPlacedRegions,
        ))

    db.commit()
    return {"id": session.id}


# ── GET /session/stats ────────────────────────────────────────────────────────

@router.get("/session/stats", response_model=SessionStatsResponse)
def get_session_stats(
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    sessions = db.exec(
        select(GameSession)
        .where(GameSession.user_id == user_id, GameSession.game_id == GAME_ID)
        .order_by(GameSession.played_at.desc())  # type: ignore[arg-type]
    ).all()

    total_denoms = db.exec(select(Denomination)).all()

    if not sessions:
        return SessionStatsResponse(
            sessions=[],
            aggregate=AggregateStats(
                total_sessions=0,
                avg_score_pct=0.0,
                best_score_pct=0.0,
                best_session=None,
                unique_denoms=0,
                total_denoms=len(total_denoms),
            ),
            type_performance=TypePerformance(doc_pct=None, docg_pct=None),
            top_regions=[],
            low_regions=[],
        )

    session_ids = [s.id for s in sessions]
    all_attempts = db.exec(
        select(SessionCardAttempt).where(SessionCardAttempt.session_id.in_(session_ids))  # type: ignore[arg-type]
    ).all()

    # ── Aggregate stats ───────────────────────────────────────────────────────
    score_pcts = [s.score / s.max_score * 100 for s in sessions if s.max_score > 0]
    avg_score_pct = sum(score_pcts) / len(score_pcts) if score_pcts else 0.0

    best_session = max(sessions, key=lambda s: s.score / s.max_score if s.max_score > 0 else 0)
    best_score_pct = best_session.score / best_session.max_score * 100 if best_session.max_score > 0 else 0.0

    unique_denoms = len({a.denomination_name for a in all_attempts})

    # ── Type performance ──────────────────────────────────────────────────────
    doc_scores: List[float] = []
    docg_scores: List[float] = []
    for a in all_attempts:
        pct = _score_for_card(a.wrong_attempts, a.result) / 3 * 100
        if a.denomination_type == "DOC":
            doc_scores.append(pct)
        elif a.denomination_type == "DOCG":
            docg_scores.append(pct)

    type_performance = TypePerformance(
        doc_pct=round(sum(doc_scores) / len(doc_scores), 1) if doc_scores else None,
        docg_pct=round(sum(docg_scores) / len(docg_scores), 1) if docg_scores else None,
    )

    # ── Region performance ────────────────────────────────────────────────────
    region_correct: dict[str, int] = {}
    region_auto: dict[str, int] = {}

    for a in all_attempts:
        for region in (a.found_regions or []):
            region_correct[region] = region_correct.get(region, 0) + 1
        for region in (a.auto_placed_regions or []):
            region_auto[region] = region_auto.get(region, 0) + 1

    all_regions = set(region_correct) | set(region_auto)
    region_stats: List[RegionStat] = []
    for r in all_regions:
        correct = region_correct.get(r, 0)
        auto = region_auto.get(r, 0)
        total = correct + auto
        region_stats.append(RegionStat(region=r, score_pct=round(correct / total * 100, 1)))

    region_stats.sort(key=lambda x: x.score_pct, reverse=True)
    top_regions = region_stats[:4]
    low_regions = list(reversed(region_stats[-4:])) if len(region_stats) >= 4 else list(reversed(region_stats))

    # ── Session summaries (last 5) ────────────────────────────────────────────
    session_summaries = [
        SessionSummary(
            id=s.id,
            filter=s.filter,
            score_pct=round(s.score / s.max_score * 100, 1) if s.max_score > 0 else 0.0,
            items=sum(1 for a in all_attempts if a.session_id == s.id),
            duration_seconds=s.duration_seconds,
            played_at=s.played_at,
        )
        for s in sessions[:5]
    ]

    return SessionStatsResponse(
        sessions=session_summaries,
        aggregate=AggregateStats(
            total_sessions=len(sessions),
            avg_score_pct=round(avg_score_pct, 1),
            best_score_pct=round(best_score_pct, 1),
            best_session=BestSessionInfo(played_at=best_session.played_at, filter=best_session.filter),
            unique_denoms=unique_denoms,
            total_denoms=len(total_denoms),
        ),
        type_performance=type_performance,
        top_regions=top_regions,
        low_regions=low_regions,
    )
