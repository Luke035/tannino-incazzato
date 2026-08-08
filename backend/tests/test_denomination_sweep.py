"""Data-integrity tests for the federdoc sweep (issue #35).

The sweep's candidate list must be produced by a committed, deterministic
script and committed alongside the corrections, so a reviewer can see exactly
which questions were looked at (docs/question-bank-federdoc-sweep.md). These
tests pin that: the committed candidate CSV is byte-for-byte what the script
produces from the committed seed CSV and snapshot, the recorded verdicts cover
exactly the candidates and no more, and every candidate that a correction in
`corrections.py` touches is recorded as `corrected` in the verdict file.

No network and no database: a pure consistency check over committed files.
"""
import csv
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND / "scripts"))

from select_denomination_candidates import (  # noqa: E402
    select_candidates,
    write_candidates,
)

from app.questions.corrections import CORRECTIONS, FieldCorrection  # noqa: E402

SEED_CSV = BACKEND / "data" / "question_bank.csv"
SNAPSHOT = BACKEND / "data" / "federdoc_snapshot.json"
CANDIDATES_CSV = BACKEND / "data" / "denomination_sweep_candidates.csv"
VERDICTS_CSV = BACKEND / "data" / "denomination_sweep_verdicts.csv"

VALID_VERDICTS = {"unchanged", "corrected", "deactivated", "outside_authority"}


@pytest.fixture(scope="module")
def candidate_ns() -> set:
    with open(CANDIDATES_CSV, encoding="utf-8", newline="") as handle:
        return {row["n"] for row in csv.DictReader(handle)}


@pytest.fixture(scope="module")
def verdict_rows() -> list:
    with open(VERDICTS_CSV, encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def test_committed_candidate_file_matches_the_script(tmp_path):
    """The candidate list is exactly what the committed script produces from the
    committed inputs — re-running is deterministic and byte-identical."""
    regenerated = tmp_path / "candidates.csv"
    write_candidates(select_candidates(SEED_CSV, SNAPSHOT), regenerated)
    assert regenerated.read_bytes() == CANDIDATES_CSV.read_bytes(), (
        "the committed denomination_sweep_candidates.csv is stale; re-run "
        "scripts/select_denomination_candidates.py and commit the result"
    )


def test_selection_is_deterministic():
    """Two runs over the same inputs select the same candidates in the same
    order — the net cast is reproducible."""
    first = [c["n"] for c in select_candidates(SEED_CSV, SNAPSHOT)]
    second = [c["n"] for c in select_candidates(SEED_CSV, SNAPSHOT)]
    assert first == second


def test_every_candidate_has_exactly_one_recorded_verdict(
    candidate_ns, verdict_rows
):
    verdict_ns = [row["n"] for row in verdict_rows]
    assert len(verdict_ns) == len(set(verdict_ns)), "a candidate is recorded twice"
    assert set(verdict_ns) == candidate_ns, (
        "the recorded verdicts do not cover exactly the candidate list"
    )


def test_every_verdict_is_one_of_the_four(verdict_rows):
    for row in verdict_rows:
        assert row["verdict"] in VALID_VERDICTS, (
            f"n={row['n']} carries verdict {row['verdict']!r}, not one of "
            f"{sorted(VALID_VERDICTS)}"
        )


def test_corrected_verdicts_cite_the_snapshot(verdict_rows):
    """A verdict that changes or removes a question must rest on a snapshot
    fact — its region and entry are recorded."""
    for row in verdict_rows:
        if row["verdict"] in ("corrected", "deactivated"):
            assert row["region"].strip(), f"n={row['n']} corrected without a region"
            assert row["snapshot_entry"].strip(), (
                f"n={row['n']} corrected without citing a snapshot entry"
            )


def test_sweep_corrections_are_recorded_as_corrected(verdict_rows):
    """Every question the sweep's entries in corrections.py touch is a candidate
    recorded as `corrected` — the corrections never exceed the net that was
    cast, nor the verdicts that were reviewed. n=425 is excluded: it was landed
    by issue #34, before the sweep, though the sweep independently reached it."""
    by_text = {}
    with open(SEED_CSV, encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            by_text[row["domanda"].strip()] = row["n"]

    corrected_ns = {row["n"] for row in verdict_rows if row["verdict"] == "corrected"}

    already_landed = "[question text removed]"
    for correction in CORRECTIONS:
        if not isinstance(correction, FieldCorrection):
            continue
        if correction.question_text == already_landed:
            continue
        n = by_text.get(correction.question_text)
        assert n is not None, (
            f"correction targets {correction.question_text!r}, absent from the "
            "seed CSV"
        )
        assert n in corrected_ns, (
            f"correction touches n={n} but the sweep verdict file does not record "
            "it as corrected"
        )
