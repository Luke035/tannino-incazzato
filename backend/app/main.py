import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.denominations.router import router as denominations_router
from app.ai.router import router as ai_router
from app.auth.router import router as auth_router
from app.questions.router import router as questions_router
from app.sessions.router import router as sessions_router

app = FastAPI(title="Sommelier Game API")

_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(denominations_router)
app.include_router(ai_router)
app.include_router(auth_router)
app.include_router(sessions_router)
app.include_router(questions_router)


@app.get("/health")
def health():
    return {"status": "ok"}
