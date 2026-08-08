"""
Usage: uv run python scripts/snapshot_federdoc.py [output-path]

Reads the 25 federdoc regional pages under
https://www.federdoc.com/vini-a-d-o/<region>/ and writes a dated, committed
snapshot mapping each of the 20 Italian regions to its D.O.C.G. and D.O.C.
lists. The snapshot is the authority every Question Bank correction cites
(docs/adr/0012-question-bank-corrections.md).

This is an offline, build-time script — it is never run at boot. Re-running it
against unchanged upstream pages produces a byte-identical file: regions are
emitted in a fixed order, each list in the order federdoc prints it, and the
snapshot date is read from the index page's "Dati e mappe aggiornati a
<month> <year>" stamp rather than from the wall clock.

Federdoc splits Piemonte across four pages and Toscana across two; those are
merged back into one region each, preserving federdoc's printed order and
dropping the duplicate that a denomination shared across two Piemonte pages
would otherwise produce.
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Allow running from any working directory
sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx  # noqa: E402

BASE_URL = "https://www.federdoc.com/vini-a-d-o/"
INDEX_URL = BASE_URL

# The 20 Italian regions in a fixed output order, each mapped to the federdoc
# page slug(s) that describe it. Piemonte and Toscana are spread across several
# pages; every other region is a single page. Trentino Alto Adige is one page
# on federdoc even though it is two autonomous provinces. 25 pages, 20 regions.
REGION_PAGES: Tuple[Tuple[str, Tuple[str, ...]], ...] = (
    ("Abruzzo", ("abruzzo",)),
    ("Basilicata", ("basilicata",)),
    ("Calabria", ("calabria",)),
    ("Campania", ("campania",)),
    ("Emilia Romagna", ("emilia-romagna",)),
    ("Friuli Venezia Giulia", ("friuli-venezia-giulia",)),
    ("Lazio", ("lazio",)),
    ("Liguria", ("liguria",)),
    ("Lombardia", ("lombardia",)),
    ("Marche", ("marche",)),
    ("Molise", ("molise",)),
    (
        "Piemonte",
        (
            "piemonte-il-nord",
            "piemonte-il-monferrato",
            "piemonte-lastigiano",
            "piemonte-le-langhe",
        ),
    ),
    ("Puglia", ("puglia",)),
    ("Sardegna", ("sardegna",)),
    ("Sicilia", ("sicilia",)),
    ("Toscana", ("toscana", "toscana-il-cuore-antico")),
    ("Trentino Alto Adige", ("trentino-alto-adige",)),
    ("Umbria", ("umbria",)),
    ("Valle d'Aosta", ("valle-daosta",)),
    ("Veneto", ("veneto",)),
)

_MONTHS = {
    "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4,
    "maggio": 5, "giugno": 6, "luglio": 7, "agosto": 8,
    "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
}

# Leading sequential number federdoc prints before each denomination name.
_LEADING_NUMBER = re.compile(r"^\d+\s*")


class _RegionPageParser(HTMLParser):
    """Extract the D.O.C.G. and D.O.C. lists from one regional page.

    The page carries a `<div class="fusion-text fusion-text-2">` block holding
    `<p><strong>D.O.C.G.</strong></p><ul>...</ul>` then
    `<p><strong>D.O.C.</strong></p><ul>...</ul>`. Each `<li>` is `N Name`.
    We track which heading we last saw and file the following list's items
    under it. Any other `<ul>` on the page (menus, footers) is ignored because
    it is not preceded by one of those two headings inside the text block.
    """

    def __init__(self) -> None:
        super().__init__()
        self.docg: List[str] = []
        self.doc: List[str] = []
        self._current: Optional[List[str]] = None
        self._pending: Optional[List[str]] = None
        self._in_li = False
        self._text_parts: List[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "ul":
            # A heading seen just before opens its list; anything else keeps
            # the list target closed so stray <ul>s are skipped.
            self._current = self._pending
            self._pending = None
        elif tag == "li" and self._current is not None:
            self._in_li = True
            self._text_parts = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "ul":
            self._current = None
        elif tag == "li" and self._in_li:
            self._in_li = False
            name = _clean_entry("".join(self._text_parts))
            if name and self._current is not None:
                self._current.append(name)

    def handle_data(self, data: str) -> None:
        if self._in_li:
            self._text_parts.append(data)
            return
        label = _normalise_label(data)
        if label == "docg":
            self._pending = self.docg
        elif label == "doc":
            self._pending = self.doc


def _normalise_label(data: str) -> Optional[str]:
    """Map a heading's text to 'docg', 'doc', or None.

    Federdoc prints "D.O.C.G." and "D.O.C." with trailing spaces and dots;
    strip them to a bare token so the two are told apart unambiguously (D.O.C.
    is a prefix of D.O.C.G., so compare the whole token, not a `startswith`).
    """
    token = re.sub(r"[^a-z]", "", data.lower())
    if token == "docg":
        return "docg"
    if token == "doc":
        return "doc"
    return None


def _clean_entry(raw: str) -> str:
    """`N Name` -> `Name`, whitespace collapsed."""
    text = " ".join(raw.split())
    return _LEADING_NUMBER.sub("", text).strip()


def _snapshot_date(index_html: str) -> str:
    """The "Dati e mappe aggiornati a <month> <year>" stamp, as YYYY-MM.

    Reading the date from the page rather than the clock is what makes a
    re-run against unchanged pages byte-identical.
    """
    match = re.search(
        r"aggiornat[ei]\s+a\s+([a-zA-Z]+)\s+(\d{4})", index_html, re.IGNORECASE
    )
    if not match:
        raise ValueError(
            "could not find the 'Dati e mappe aggiornati a <month> <year>' "
            "stamp on the federdoc index page"
        )
    month_name = match.group(1).lower()
    if month_name not in _MONTHS:
        raise ValueError(f"unrecognised Italian month in snapshot stamp: {month_name!r}")
    return f"{match.group(2)}-{_MONTHS[month_name]:02d}"


def _fetch(client: httpx.Client, url: str) -> str:
    response = client.get(url, timeout=30.0)
    response.raise_for_status()
    return response.text


def _dedupe_preserving_order(names: List[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for name in names:
        if name not in seen:
            seen.add(name)
            out.append(name)
    return out


def build_snapshot(client: httpx.Client) -> Dict:
    """Fetch every page and assemble the snapshot dict.

    Shape: {"source": ..., "updated": "YYYY-MM", "regions": [
        {"region": ..., "DOCG": [...], "DOC": [...]}, ...]}.
    """
    updated = _snapshot_date(_fetch(client, INDEX_URL))

    regions: List[Dict] = []
    for region, slugs in REGION_PAGES:
        docg: List[str] = []
        doc: List[str] = []
        for slug in slugs:
            parser = _RegionPageParser()
            parser.feed(_fetch(client, f"{BASE_URL}{slug}/"))
            docg.extend(parser.docg)
            doc.extend(parser.doc)
        regions.append(
            {
                "region": region,
                "DOCG": _dedupe_preserving_order(docg),
                "DOC": _dedupe_preserving_order(doc),
            }
        )

    return {
        "source": "https://www.federdoc.com/vini-a-d-o/",
        "updated": updated,
        "regions": regions,
    }


def main(output_path: str) -> None:
    with httpx.Client(headers={"User-Agent": "sommelier-game-snapshot/1.0"}) as client:
        snapshot = build_snapshot(client)

    # Stable, diff-friendly, byte-identical on re-run: sorted keys off (we want
    # region/DOCG/DOC order preserved), trailing newline, ensure_ascii off so
    # accented names read as themselves in the committed file.
    Path(output_path).write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Wrote federdoc snapshot for {len(snapshot['regions'])} regions "
        f"(updated {snapshot['updated']}) to {output_path}."
    )


if __name__ == "__main__":
    default_output = str(Path(__file__).parent.parent / "data" / "federdoc_snapshot.json")
    if len(sys.argv) > 2:
        print("Usage: uv run python scripts/snapshot_federdoc.py [output-path]")
        sys.exit(1)
    main(sys.argv[1] if len(sys.argv) == 2 else default_output)
