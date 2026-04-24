from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.denominations.router import router as denominations_router
from app.ai.router import router as ai_router

app = FastAPI(title="Sommelier Game API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(denominations_router)
app.include_router(ai_router)


@app.get("/health")
def health():
    return {"status": "ok"}
