"""
Usage: uv run python scripts/promote_admin.py

Promotes the configured admin email (env INITIAL_ADMIN_EMAIL) into a vacuum, at
boot, right after the migrations run and alongside the seed, backfill and
corrections steps. Idempotent like them (ADR 0014).

The rule is a single sentence: promote the configured email only when no admin
exists at all. It follows that this:

  - is a no-op on re-run, because after the first run an admin exists;
  - is a no-op when an admin already exists by any other means (promoted in the
    panel, promoted by a different email on an earlier boot);
  - never demotes and never overrides a decision made in the panel — it fills a
    vacuum, including the vacuum an admin creates by demoting themselves;
  - promotes an already-registered user; it does not create one. If the
    configured email has not registered, there is nothing to promote and the
    step reports that and moves on.

If INITIAL_ADMIN_EMAIL is unset the step does nothing: a deployment that names
no bootstrap admin has none.
"""
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# Allow running from any working directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.database import get_engine  # noqa: E402
from app.users.model import ROLE_ADMIN, User  # noqa: E402

# Arbitrary constant identifying this operation to Postgres, distinct from the
# seed and corrections keys so the steps that run back to back in one boot never
# contend for the same lock. "ADMN" — ADMiN promotion.
PROMOTE_LOCK_KEY = 0x41444D4E


@dataclass
class Result:
    # Exactly one of these describes the outcome; the others stay falsy.
    promoted_email: Optional[str] = None   # a user was promoted this run
    admin_exists: bool = False             # an admin already existed; no-op
    unregistered_email: Optional[str] = None  # configured email not registered
    no_email_configured: bool = False      # INITIAL_ADMIN_EMAIL unset


def promote_admin(session: Session, email: Optional[str]) -> Result:
    """Promote `email` to admin only when no admin exists at all.

    The whole decision hangs on one query — does any admin exist? — asked and
    answered under the caller's lock so two boots cannot both find the vacuum
    empty and both promote.
    """
    if not email:
        return Result(no_email_configured=True)

    existing_admin = session.exec(
        select(User).where(User.role == ROLE_ADMIN)
    ).first()
    if existing_admin is not None:
        # A vacuum is what this fills. There is no vacuum.
        return Result(admin_exists=True)

    user = session.exec(select(User).where(User.email == email)).first()
    if user is None:
        # Promotes a user; does not create one.
        return Result(unregistered_email=email)

    user.role = ROLE_ADMIN
    session.add(user)
    session.commit()
    return Result(promoted_email=email)


def main() -> None:
    email = os.environ.get("INITIAL_ADMIN_EMAIL", "").strip() or None
    engine = get_engine()
    with Session(engine) as session:
        # Reading "does any admin exist?" and writing the promotion must be one
        # atomic step, so two containers booting together cannot both see the
        # vacuum and both promote (or promote two different first admins).
        if session.get_bind().dialect.name == "postgresql":
            session.execute(
                text("SELECT pg_advisory_xact_lock(:key)"),
                {"key": PROMOTE_LOCK_KEY},
            )

        result = promote_admin(session, email)

    if result.promoted_email:
        print(f"Promoted {result.promoted_email!r} to admin.")
    elif result.admin_exists:
        print("An admin already exists; nothing to promote.")
    elif result.unregistered_email:
        print(
            f"Configured admin {result.unregistered_email!r} has not "
            "registered; nothing to promote."
        )
    else:
        print("No INITIAL_ADMIN_EMAIL configured; nothing to promote.")


if __name__ == "__main__":
    main()
