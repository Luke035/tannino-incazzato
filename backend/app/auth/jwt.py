import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Cookie, HTTPException, status
from jose import JWTError, jwt

ALGORITHM = "HS256"
COOKIE_NAME = "sommelier_session"
EXPIRE_DAYS = 7


def _secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET env var is not set")
    return secret


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": expire}, _secret(), algorithm=ALGORITHM)


def decode_token(token: str) -> int:
    try:
        payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return int(user_id)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


def get_current_user_id(
    sommelier_session: Optional[str] = Cookie(default=None),
) -> int:
    if sommelier_session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return decode_token(sommelier_session)


def set_auth_cookie(response, token: str) -> None:
    secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=EXPIRE_DAYS * 24 * 3600,
        secure=secure,
    )


def clear_auth_cookie(response) -> None:
    secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    response.delete_cookie(key=COOKIE_NAME, httponly=True, samesite="lax", secure=secure)
