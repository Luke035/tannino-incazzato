from typing import List, Literal
from fastapi import APIRouter
from pydantic import BaseModel
from app.ai.gemini import generate_hint, generate_memorize_tip, generate_review

router = APIRouter()


class HintRequest(BaseModel):
    denominationName: str
    denominationType: str
    wrongRegion: str
    correctRegions: List[str]
    remainingRegions: List[str]
    attemptNumber: int
    language: str = "en"


class MemorizeRequest(BaseModel):
    denominationName: str
    denominationType: str
    correctRegions: List[str]
    language: str = "en"


class HistoryItem(BaseModel):
    name: str
    type: str
    correctRegions: List[str]
    wrongAttempts: int
    result: Literal["correct", "auto-placed"]


class ReviewRequest(BaseModel):
    history: List[HistoryItem]
    language: str = "en"


@router.post("/hint")
async def hint(req: HintRequest):
    text = await generate_hint(
        req.denominationName,
        req.denominationType,
        req.wrongRegion,
        req.correctRegions,
        req.remainingRegions,
        req.attemptNumber,
        req.language,
    )
    return {"hint": text}


@router.post("/memorize")
async def memorize(req: MemorizeRequest):
    text = await generate_memorize_tip(
        req.denominationName,
        req.denominationType,
        req.correctRegions,
        req.language,
    )
    return {"tip": text}


@router.post("/review")
async def review(req: ReviewRequest):
    text = await generate_review(
        [item.model_dump() for item in req.history],
        req.language,
    )
    return {"review": text}
