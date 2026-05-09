import os
from typing import Annotated

from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import RedirectResponse
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.users.model import User, UserRead
from app.auth.jwt import (
    create_access_token,
    get_current_user_id,
    set_auth_cookie,
    clear_auth_cookie,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"


def _google_client() -> AsyncOAuth2Client:
    return AsyncOAuth2Client(
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        redirect_uri=os.environ["GOOGLE_REDIRECT_URI"],
        scope="openid email profile",
    )


# ── Schemas ──────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    first_name: str
    last_name: str


class LoginRequest(BaseModel):
    email: str
    password: str


# ── Email / Password ──────────────────────────────────────────────────────────

@router.post("/register", response_model=UserRead)
async def register(body: RegisterRequest, response: Response, db: Session = Depends(get_session)):
    if db.exec(select(User).where(User.email == body.email)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="email_exists")

    user = User(
        email=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
        hashed_password=_pwd_context.hash(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    set_auth_cookie(response, create_access_token(user.id))
    return user


@router.post("/login", response_model=UserRead)
async def login(body: LoginRequest, response: Response, db: Session = Depends(get_session)):
    user = db.exec(select(User).where(User.email == body.email)).first()
    if not user or not user.hashed_password or not _pwd_context.verify(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")

    set_auth_cookie(response, create_access_token(user.id))
    return user


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserRead)
async def me(
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return user


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.get("/google")
async def google_login():
    client = _google_client()
    uri, _ = client.create_authorization_url(GOOGLE_AUTH_URL, access_type="offline")
    return RedirectResponse(uri)


@router.get("/google/callback")
async def google_callback(code: str, response: Response, db: Session = Depends(get_session)):
    client = _google_client()
    await client.fetch_token(GOOGLE_TOKEN_URL, code=code)
    resp = await client.get(GOOGLE_USERINFO_URL)
    info = resp.json()

    google_id: str = info["sub"]
    email: str = info.get("email", "")
    first_name: str = info.get("given_name", "")
    last_name: str = info.get("family_name", "")

    user = db.exec(select(User).where(User.google_id == google_id)).first()
    if not user:
        user = db.exec(select(User).where(User.email == email)).first()
        if user:
            user.google_id = google_id
        else:
            user = User(
                email=email,
                first_name=first_name,
                last_name=last_name,
                google_id=google_id,
            )
        db.add(user)
        db.commit()
        db.refresh(user)

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    redirect = RedirectResponse(url=f"{frontend_url}/en")
    set_auth_cookie(redirect, create_access_token(user.id))
    return redirect
