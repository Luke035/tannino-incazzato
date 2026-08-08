"""Cast the net for the federdoc sweep: select every Question Bank candidate
whose answer *might* be contradicted by the federdoc snapshot.

The sweep (issue #35, ADR 0012) is an offline pass that finds every question
whose stored answer is stale against the January 2026 federdoc snapshot of
Italy's D.O.C.G./D.O.C. denominations. Before any judgement is exercised, the
*net that was cast* must be mechanical, deterministic and committed, so a
reviewer can see exactly which questions were looked at and which were not.

A false positive costs nothing — a candidate the sweep looks at and leaves
alone gets a recorded "unchanged" verdict. A false negative is a wrong answer
left in the bank forever. So the net is deliberately wide: two independent
selectors, unioned.

Selector A — **token match.** Any question whose text or reference answer
mentions a denomination *tier* token (DOC, DOCG, IGT, and their dotted /
spelled-out spellings). These are the questions that talk about denomination
tiers at all, whether or not they name a denomination the snapshot knows.

Selector B — **denomination match.** Any question whose text or reference
answer mentions a denomination *name* the snapshot lists (e.g. "Cirò",
"Barolo"), whether or not it uses a tier token. This catches a question that
asserts a wine's tier without ever writing "DOCG".

The union is the candidate list. Selector A alone is the larger, tier-token
half; Selector B pulls in the questions that name a denomination without a tier
token. The script writes a committed CSV of the union so the sweep's input is
auditable and re-runnable: running it against the same CSV and snapshot
produces a byte-identical file.

This script casts the net only. It reads no verdict and writes no correction —
the corrections themselves live, reviewed by hand, in
`app/questions/corrections.py`.
"""
import argparse
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Dict, List, Set, Tuple

BACKEND = Path(__file__).resolve().parent.parent
SEED_CSV = BACKEND / "data" / "question_bank.csv"
SNAPSHOT = BACKEND / "data" / "federdoc_snapshot.json"
CANDIDATES_CSV = BACKEND / "data" / "denomination_sweep_candidates.csv"

# Tier tokens, as they actually appear in the bank: bare, dotted, and the two
# spelled-out Italian forms. Matched case-insensitively on word boundaries so
# "DOC" does not fire on "document" and "IGT" does not fire inside a longer run
# of letters. IGT is included in the net even though the snapshot cannot
# adjudicate it (federdoc does not list IGTs) — an IGT question that turns out
# stale is reported and left alone, never guessed at, but it must still be seen.
TIER_TOKEN_PATTERNS = (
    r"DOCG",
    r"D\.O\.C\.G\.?",
    r"DOC",
    r"D\.O\.C\.?",
    r"IGT",
    r"I\.G\.T\.?",
    r"D\.O\.",
    r"denominazione\s+di\s+origine\s+controllata\s+e\s+garantita",
    r"denominazione\s+di\s+origine\s+controllata",
    r"indicazione\s+geografica\s+tipica",
)
# Longest-first so "D.O.C.G." wins over "D.O.C." at the same position; anchored
# on word boundaries.
TIER_RE = re.compile(
    r"(?<![A-Za-z])(?:" + "|".join(TIER_TOKEN_PATTERNS) + r")(?![A-Za-z])",
    re.IGNORECASE,
)


def _fold(text: str) -> str:
    """Normalise for denomination-name matching: NFKD-fold accents and curly
    quotes, collapse whitespace, lower-case. The snapshot uses a curly
    apostrophe ("Montepulciano d’Abruzzo") while the bank is inconsistent, so
    matching on the raw string would miss real hits."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.replace("\u2019", "'").replace("\u2018", "'")
    return re.sub(r"\s+", " ", text).strip().lower()


def load_snapshot_names(snapshot_path: Path) -> List[str]:
    """Every distinct DOCG/DOC denomination name in the snapshot, longest-first
    so a name that is a prefix of another does not steal the match."""
    data = json.loads(snapshot_path.read_text(encoding="utf-8"))
    names: Set[str] = set()
    for region in data["regions"]:
        for name in region.get("DOCG", []) + region.get("DOC", []):
            names.add(name)
    # A denomination name shorter than 4 folded characters is too short to
    # match without firing on ordinary words; the snapshot has none today, but
    # guard the net against a one-word "Doc"-like entry a future snapshot adds.
    return sorted(
        (n for n in names if len(_fold(n)) >= 4), key=lambda n: (-len(n), n)
    )


def _name_regexes(names: List[str]) -> List[Tuple[str, "re.Pattern[str]"]]:
    out = []
    for name in names:
        folded = _fold(name)
        pattern = re.compile(
            r"(?<![a-z0-9'])" + re.escape(folded) + r"(?![a-z0-9'])"
        )
        out.append((name, pattern))
    return out


def select_candidates(
    csv_path: Path, snapshot_path: Path
) -> List[Dict[str, str]]:
    names = load_snapshot_names(snapshot_path)
    name_regexes = _name_regexes(names)

    candidates: List[Dict[str, str]] = []
    with open(csv_path, encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            text = row.get("domanda", "") or ""
            answer = row.get("risposta_corretta", "") or ""
            haystack = f"{text}\n{answer}"

            token_hit = bool(TIER_RE.search(haystack))

            folded = _fold(haystack)
            matched_names = sorted(
                {name for name, rx in name_regexes if rx.search(folded)}
            )

            if not token_hit and not matched_names:
                continue

            selectors = []
            if token_hit:
                selectors.append("token")
            if matched_names:
                selectors.append("denomination")

            candidates.append(
                {
                    "n": row.get("n", ""),
                    "formato": row.get("formato", ""),
                    "domanda": text,
                    "risposta_corretta": answer,
                    "open_subtype": row.get("open_subtype", ""),
                    "selectors": "+".join(selectors),
                    "matched_denominations": "; ".join(matched_names),
                }
            )
    return candidates


def write_candidates(candidates: List[Dict[str, str]], out_path: Path) -> None:
    fieldnames = [
        "n",
        "formato",
        "domanda",
        "risposta_corretta",
        "open_subtype",
        "selectors",
        "matched_denominations",
    ]
    with open(out_path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in candidates:
            writer.writerow(row)


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=SEED_CSV)
    parser.add_argument("--snapshot", type=Path, default=SNAPSHOT)
    parser.add_argument("--out", type=Path, default=CANDIDATES_CSV)
    parser.add_argument(
        "--stats",
        action="store_true",
        help="print selector counts to stderr and do not write the file",
    )
    args = parser.parse_args(argv)

    candidates = select_candidates(args.csv, args.snapshot)

    token = sum(1 for c in candidates if "token" in c["selectors"])
    denom = sum(1 for c in candidates if "denomination" in c["selectors"])
    both = sum(1 for c in candidates if c["selectors"] == "token+denomination")
    print(
        f"union={len(candidates)} token={token} denomination={denom} both={both}",
        file=sys.stderr,
    )

    if args.stats:
        return 0

    write_candidates(candidates, args.out)
    print(f"wrote {len(candidates)} candidates to {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
