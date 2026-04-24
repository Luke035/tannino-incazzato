"""
Usage: uv run python scripts/ingest_denominations.py <path-to-denominations.json>

Clears the denomination table and re-inserts all entries from the JSON file.
Idempotent — safe to run multiple times.
"""
import json
import sys
from pathlib import Path

# Allow running from any working directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import Session, select
from app.database import get_engine, create_db_and_tables
from app.denominations.model import Denomination


def main(json_path: str) -> None:
    data = json.loads(Path(json_path).read_text())
    create_db_and_tables()
    engine = get_engine()

    with Session(engine) as session:
        existing = session.exec(select(Denomination)).all()
        for row in existing:
            session.delete(row)
        session.commit()

        for entry in data:
            session.add(Denomination(
                name=entry["name"],
                type=entry["type"],
                regions=entry["regions"],
            ))
        session.commit()

    print(f"Ingested {len(data)} denominations.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: uv run python scripts/ingest_denominations.py <path-to-denominations.json>")
        sys.exit(1)
    main(sys.argv[1])
