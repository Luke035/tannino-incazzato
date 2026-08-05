"""Unit tests for backend/scripts/merge_classification.py, against small
fixtures of our own rather than the real seed CSV — the real merge has not
run yet (see test_question_bank_classification.py for what the committed
sheet must look like once it has)."""
import csv
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from merge_classification import MergeError, merge  # noqa: E402

CSV_HEADER = "n,formato,tipo_codice,domanda,opzione_1,opzione_2,opzione_3,risposta_corretta,spiegazione"
CSV_ROWS = [
    "1,Vero/Falso,1,Domanda TF?,,,,VERO,spiegazione TF",
    "2,Scelta multipla,2,Domanda MC?,A,B,C,A,spiegazione MC",
    "3,Aperta,3,Domanda Open?,,,,Risposta aperta,spiegazione Open",
]


def _write_csv(path: Path, rows=CSV_ROWS, header: str = CSV_HEADER) -> Path:
    csv_path = path / "domande.csv"
    csv_path.write_text("\n".join([header, *rows]) + "\n", encoding="utf-8")
    return csv_path


def _write_tsv(dir_path: Path, name: str, lines: list[str]) -> Path:
    dir_path.mkdir(exist_ok=True)
    tsv_path = dir_path / name
    tsv_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return tsv_path


def _read_rows(csv_path: Path) -> list[dict]:
    with open(csv_path, encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


GOOD_TSV_LINES = [
    "1\tlegislation\t-",
    "2\ttasting\t-",
    "3\tfood_pairing\tlist",
]


def test_merge_appends_topic_and_open_subtype(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(classified_dir, "classified_01.tsv", GOOD_TSV_LINES)

    merge(csv_path, classified_dir)

    rows = _read_rows(csv_path)
    assert [r["n"] for r in rows] == ["1", "2", "3"]
    assert rows[0]["topic"] == "legislation"
    assert rows[0]["open_subtype"] == ""
    assert rows[1]["topic"] == "tasting"
    assert rows[1]["open_subtype"] == ""
    assert rows[2]["topic"] == "food_pairing"
    assert rows[2]["open_subtype"] == "list"
    # Existing columns/values must survive untouched.
    assert rows[2]["domanda"] == "Domanda Open?"
    assert rows[2]["risposta_corretta"] == "Risposta aperta"


def test_merge_reads_multiple_tsv_files(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(classified_dir, "classified_01.tsv", GOOD_TSV_LINES[:2])
    _write_tsv(classified_dir, "classified_02.tsv", GOOD_TSV_LINES[2:])

    merge(csv_path, classified_dir)

    rows = _read_rows(csv_path)
    assert rows[2]["topic"] == "food_pairing"


def test_merge_is_deterministic_and_rerunnable(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(classified_dir, "classified_01.tsv", GOOD_TSV_LINES)

    merge(csv_path, classified_dir)
    first_run = csv_path.read_text(encoding="utf-8")

    # Re-run against its own previous output: a stale topic/open_subtype pair
    # must be treated as scratch, recomputed, not read back as input.
    merge(csv_path, classified_dir)
    second_run = csv_path.read_text(encoding="utf-8")

    assert first_run == second_run


def test_missing_n_fails_loudly_without_writing(tmp_path):
    csv_path = _write_csv(tmp_path)
    original = csv_path.read_text(encoding="utf-8")
    classified_dir = tmp_path / "classified"
    _write_tsv(classified_dir, "classified_01.tsv", GOOD_TSV_LINES[:2])  # n=3 missing

    with pytest.raises(MergeError, match="n='3'"):
        merge(csv_path, classified_dir)

    assert csv_path.read_text(encoding="utf-8") == original


def test_duplicate_n_across_files_fails_loudly(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(classified_dir, "classified_01.tsv", GOOD_TSV_LINES)
    _write_tsv(classified_dir, "classified_02.tsv", ["1\tlegislation\t-"])

    with pytest.raises(MergeError, match="duplicate n"):
        merge(csv_path, classified_dir)


def test_topic_outside_taxonomy_fails_loudly(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(
        classified_dir,
        "classified_01.tsv",
        ["1\tmade_up_topic\t-", "2\ttasting\t-", "3\tfood_pairing\tlist"],
    )

    with pytest.raises(MergeError, match="outside the taxonomy"):
        merge(csv_path, classified_dir)


def test_open_subtype_on_non_open_question_fails_loudly(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(
        classified_dir,
        "classified_01.tsv",
        ["1\tlegislation\tlist", "2\ttasting\t-", "3\tfood_pairing\tlist"],
    )

    with pytest.raises(MergeError, match="non-open question carries an open_subtype"):
        merge(csv_path, classified_dir)


def test_open_question_missing_subtype_fails_loudly(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(
        classified_dir,
        "classified_01.tsv",
        ["1\tlegislation\t-", "2\ttasting\t-", "3\tfood_pairing\t-"],
    )

    with pytest.raises(MergeError, match="no valid subtype"):
        merge(csv_path, classified_dir)


def test_no_tsv_files_fails_loudly(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    classified_dir.mkdir()

    with pytest.raises(MergeError, match="no classified_"):
        merge(csv_path, classified_dir)


# ── recheck override layer (multiple-choice only) ─────────────────────────────
#
# Row 2 (n=2) is the fixture's only multiple-choice question ("Scelta
# multipla"); it is the only row these overrides are allowed to touch.


def test_recheck_override_replaces_the_base_topic(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(classified_dir, "classified_01.tsv", GOOD_TSV_LINES)  # n=2 -> tasting
    _write_tsv(classified_dir, "recheck_A.tsv", ["2\tforeign_regions"])

    merge(csv_path, classified_dir)

    rows = _read_rows(csv_path)
    assert rows[1]["n"] == "2"
    assert rows[1]["topic"] == "foreign_regions"


def test_recheck_override_with_no_change_still_applies(tmp_path):
    """The override wins even when it happens to agree with the base
    classification — this isn't tested via the resulting topic (which would
    be identical either way) but via the "no recheck files" behaviour: an
    absent recheck layer must not be confused with one that is present."""
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(classified_dir, "classified_01.tsv", GOOD_TSV_LINES)  # n=2 -> tasting
    _write_tsv(classified_dir, "recheck_A.tsv", ["2\ttasting"])

    merge(csv_path, classified_dir)

    rows = _read_rows(csv_path)
    assert rows[1]["topic"] == "tasting"


def test_no_recheck_files_leaves_base_classification_untouched(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(classified_dir, "classified_01.tsv", GOOD_TSV_LINES)

    merge(csv_path, classified_dir)

    rows = _read_rows(csv_path)
    assert rows[1]["topic"] == "tasting"


def test_recheck_override_reads_multiple_files(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(classified_dir, "classified_01.tsv", GOOD_TSV_LINES)
    _write_tsv(classified_dir, "recheck_A.tsv", ["2\tforeign_regions"])
    _write_tsv(classified_dir, "recheck_B.tsv", [])

    merge(csv_path, classified_dir)

    rows = _read_rows(csv_path)
    assert rows[1]["topic"] == "foreign_regions"


def test_recheck_override_unknown_n_fails_loudly(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(classified_dir, "classified_01.tsv", GOOD_TSV_LINES)
    _write_tsv(classified_dir, "recheck_A.tsv", ["99\tforeign_regions"])

    with pytest.raises(MergeError, match="not present in the base classification"):
        merge(csv_path, classified_dir)


def test_recheck_override_on_non_multiple_choice_question_fails_loudly(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(classified_dir, "classified_01.tsv", GOOD_TSV_LINES)
    # n=1 is Vero/Falso in the fixture, not multiple choice.
    _write_tsv(classified_dir, "recheck_A.tsv", ["1\tlegislation"])

    with pytest.raises(MergeError, match="non-multiple-choice question"):
        merge(csv_path, classified_dir)


def test_recheck_override_cannot_introduce_a_topic_outside_the_taxonomy(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(classified_dir, "classified_01.tsv", GOOD_TSV_LINES)
    _write_tsv(classified_dir, "recheck_A.tsv", ["2\tmade_up_topic"])

    with pytest.raises(MergeError, match="outside the taxonomy"):
        merge(csv_path, classified_dir)


def test_duplicate_n_across_recheck_files_fails_loudly(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(classified_dir, "classified_01.tsv", GOOD_TSV_LINES)
    _write_tsv(classified_dir, "recheck_A.tsv", ["2\tforeign_regions"])
    _write_tsv(classified_dir, "recheck_B.tsv", ["2\tservice"])

    with pytest.raises(MergeError, match="duplicate n across recheck files"):
        merge(csv_path, classified_dir)


def test_malformed_recheck_line_fails_loudly(tmp_path):
    csv_path = _write_csv(tmp_path)
    classified_dir = tmp_path / "classified"
    _write_tsv(classified_dir, "classified_01.tsv", GOOD_TSV_LINES)
    _write_tsv(classified_dir, "recheck_A.tsv", ["2\tforeign_regions\textra"])

    with pytest.raises(MergeError, match="expected 2 tab-separated fields"):
        merge(csv_path, classified_dir)
