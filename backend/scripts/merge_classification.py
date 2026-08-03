"""
Usage: uv run python scripts/merge_classification.py <classified-dir> [--csv <path>]

Merges the offline topic/open_subtype classification into the seed CSV
(docs/question-bank-classification.md). The classification is produced once,
offline, by an agent reading the whole bank; it is not a runtime model call,
and this script does not add one — it only merges TSV files that already exist
on disk.

`<classified-dir>` must contain one or more `classified_*.tsv` files, each line
`n<TAB>topic<TAB>open_subtype`, where `open_subtype` is `-` for every question
that is not Open. `n` is the seed CSV's own `n` column.

`<classified-dir>` may also contain `recheck_*.tsv` files: an optional
multiple-choice-only override layer, `n<TAB>topic` (no subtype column — every
row is multiple choice by construction). The base classification pass saw only
the question stem; for some short multiple-choice stems that is not enough to
classify without the options and the correct answer ("LVB è una classificazione
del:" only reads as `foreign_regions` once you see the answer is Porto), so a
second pass re-reads those with the full question and its topic wins wherever
it disagrees with the base pass. If no `recheck_*.tsv` files are present the
override layer is skipped entirely — it is optional as an input mechanism, but
any file that is present is held to the same fail-loud posture as the base
classification: an `n` a recheck file names that the base classification does
not know about, or that belongs to a non-multiple-choice question, fails the
whole merge.

This is not a boot-time step like `seed_questions.py` — it edits the committed
CSV once, by hand, whenever a classification lands or a correction to it does,
and its output is committed. It must never be added to `entrypoint.sh` or
`start.sh`.

It IS deterministic and re-runnable: given the same CSV base columns and the
same classified TSVs it produces byte-identical output, whether run against the
original unclassified sheet or against its own previous output (a stale
`topic`/`open_subtype` column pair is treated as scratch and always
recomputed, never read back as input).

Same posture as seed.py: a bank that silently merges a classification for 1849
of 1851 rows is worse than one that refuses to merge at all. Every problem is
collected and reported together, and nothing is written unless the whole merge
validates: a missing or duplicated `n`, a topic outside the taxonomy, an
`open_subtype` set on a non-open question, an open question left without one,
or a recheck override that names an unknown `n` or a non-multiple-choice one.
"""
import csv
import sys
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple

# Allow running from any working directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.questions.model import (  # noqa: E402
    FORMAT_MULTIPLE_CHOICE,
    FORMAT_OPEN,
    SUBTYPE_CONCEPTUAL,
    SUBTYPE_LIST,
    TOPICS,
)
from app.questions.seed import FORMAT_BY_CSV_LABEL  # noqa: E402

DEFAULT_CSV = Path(__file__).parent.parent / "data" / "question_bank.csv"

# What a TSV line carries for a question that is not Open.
NO_SUBTYPE = "-"
VALID_SUBTYPES = {SUBTYPE_CONCEPTUAL, SUBTYPE_LIST}

# Columns this script owns. Stripped from whatever is read (so a previous run's
# output can be fed back in) and always recomputed fresh.
CLASSIFICATION_COLUMNS = ("topic", "open_subtype")


class MergeError(Exception):
    """Raised with every problem found in one pass, so a run reports
    everything wrong at once rather than a whack-a-mole of single failures."""


def _load_classifications(classified_dir: Path) -> Dict[str, Tuple[str, str]]:
    """Read every `classified_*.tsv` in `classified_dir` into {n: (topic, open_subtype)}."""
    paths = sorted(classified_dir.glob("classified_*.tsv"))
    if not paths:
        raise MergeError(f"no classified_*.tsv files found in {classified_dir}")

    by_n: Dict[str, Tuple[str, str]] = {}
    duplicates: List[str] = []
    for path in paths:
        with open(path, encoding="utf-8") as handle:
            for line_no, raw_line in enumerate(handle, start=1):
                line = raw_line.rstrip("\n")
                if not line:
                    continue
                parts = line.split("\t")
                if len(parts) != 3:
                    raise MergeError(
                        f"{path.name}:{line_no}: expected 3 tab-separated fields, "
                        f"got {len(parts)}: {line!r}"
                    )
                n, topic, open_subtype = (p.strip() for p in parts)
                if n in by_n:
                    duplicates.append(n)
                by_n[n] = (topic, open_subtype)

    if duplicates:
        raise MergeError(
            f"duplicate n across classification files: {sorted(set(duplicates))}"
        )

    return by_n


def _load_recheck_overrides(classified_dir: Path) -> Dict[str, str]:
    """Read every `recheck_*.tsv` in `classified_dir` into {n: topic}.

    An empty result (no `recheck_*.tsv` files present) means the override
    layer is skipped entirely — it is optional as an input mechanism. Any
    file that IS present is held to the same fail-loud posture as the base
    classification: a malformed line or a duplicate `n` across recheck files
    fails the whole merge rather than being silently dropped.
    """
    paths = sorted(classified_dir.glob("recheck_*.tsv"))
    if not paths:
        return {}

    by_n: Dict[str, str] = {}
    duplicates: List[str] = []
    for path in paths:
        with open(path, encoding="utf-8") as handle:
            for line_no, raw_line in enumerate(handle, start=1):
                line = raw_line.rstrip("\n")
                if not line:
                    continue
                parts = line.split("\t")
                if len(parts) != 2:
                    raise MergeError(
                        f"{path.name}:{line_no}: expected 2 tab-separated fields, "
                        f"got {len(parts)}: {line!r}"
                    )
                n, topic = (p.strip() for p in parts)
                if n in by_n:
                    duplicates.append(n)
                by_n[n] = topic

    if duplicates:
        raise MergeError(
            f"duplicate n across recheck files: {sorted(set(duplicates))}"
        )

    return by_n


def merge(csv_path: Path, classified_dir: Path) -> None:
    classification = _load_classifications(classified_dir)
    overrides = _load_recheck_overrides(classified_dir)

    # utf-8-sig: the exported sheet carries a BOM on its first header, same as
    # seed.py's own parsing.
    with open(csv_path, encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        base_fieldnames = [
            f for f in (reader.fieldnames or []) if f not in CLASSIFICATION_COLUMNS
        ]
        rows = [{k: row[k] for k in base_fieldnames} for row in reader]

    errors: List[str] = []
    merged_rows: List[dict] = []
    seen_ns: set = set()
    overrides_applied: set = set()
    overrides_changed = 0

    for line, row in enumerate(rows, start=2):
        n = row["n"].strip()
        if n in seen_ns:
            errors.append(f"line {line}: duplicate n={n!r} in the seed CSV itself")
        seen_ns.add(n)

        if n not in classification:
            errors.append(f"line {line}: no classification supplied for n={n!r}")
            continue

        topic, open_subtype = classification[n]
        question_format = FORMAT_BY_CSV_LABEL.get(row["formato"].strip())
        is_open = question_format == FORMAT_OPEN

        if n in overrides:
            overrides_applied.add(n)
            if question_format != FORMAT_MULTIPLE_CHOICE:
                errors.append(
                    f"line {line} (n={n}): recheck override applies to a "
                    "non-multiple-choice question — this layer is multiple-choice-only"
                )
            elif overrides[n] != topic:
                overrides_changed += 1
                topic = overrides[n]

        if topic not in TOPICS:
            errors.append(f"line {line} (n={n}): topic {topic!r} is outside the taxonomy")

        if is_open:
            if open_subtype not in VALID_SUBTYPES:
                errors.append(
                    f"line {line} (n={n}): open question has no valid subtype "
                    f"(got {open_subtype!r})"
                )
        elif open_subtype != NO_SUBTYPE:
            errors.append(
                f"line {line} (n={n}): non-open question carries an open_subtype "
                f"({open_subtype!r})"
            )

        merged = dict(row)
        merged["topic"] = topic
        merged["open_subtype"] = open_subtype if is_open else ""
        merged_rows.append(merged)

    unused = set(classification) - seen_ns
    if unused:
        errors.append(
            f"classification has n values not present in the CSV: {sorted(unused)}"
        )

    unknown_overrides = set(overrides) - overrides_applied
    if unknown_overrides:
        errors.append(
            "recheck override has n values not present in the base classification: "
            f"{sorted(unknown_overrides)}"
        )

    if errors:
        raise MergeError("\n".join(errors))

    out_fieldnames = base_fieldnames + list(CLASSIFICATION_COLUMNS)
    tmp_path = csv_path.with_suffix(csv_path.suffix + ".tmp")
    with open(tmp_path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=out_fieldnames)
        writer.writeheader()
        writer.writerows(merged_rows)
    tmp_path.replace(csv_path)

    print(f"Merged classification for {len(merged_rows)} questions into {csv_path}.")
    if overrides:
        print(
            f"Recheck override applied to {len(overrides_applied)} question(s), "
            f"{overrides_changed} of which changed topic."
        )
    topic_counts = Counter(r["topic"] for r in merged_rows)
    print("Final topic distribution:")
    for topic in TOPICS:
        print(f"  {topic}: {topic_counts.get(topic, 0)}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) not in (1, 3) or (len(args) == 3 and args[1] != "--csv"):
        print(__doc__)
        sys.exit(1)

    classified_dir_arg = Path(args[0])
    csv_path_arg = Path(args[2]) if len(args) == 3 else DEFAULT_CSV

    try:
        merge(csv_path_arg, classified_dir_arg)
    except MergeError as exc:
        print(f"Merge failed — nothing was written:\n{exc}", file=sys.stderr)
        sys.exit(1)
