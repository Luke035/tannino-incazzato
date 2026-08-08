"""Data-integrity tests for the committed federdoc snapshot.

The snapshot (data/federdoc_snapshot.json, produced by
scripts/snapshot_federdoc.py) is the authority every Question Bank correction
cites (ADR 0012). These tests assert its shape without hitting the network.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from snapshot_federdoc import _RegionPageParser, _snapshot_date  # noqa: E402

SNAPSHOT = Path(__file__).parent.parent / "data" / "federdoc_snapshot.json"

# A minimal stand-in for a federdoc regional page's text block: the same two
# headings and `<li>N Name</li>` shape the real pages use, plus a stray menu
# <ul> that must be ignored because no D.O.C.G./D.O.C. heading precedes it.
_PAGE_HTML = """
<ul><li>Some menu item</li></ul>
<div class="fusion-text fusion-text-2">
<p><strong>D.O.C.G. </strong></p>
<ul><li>1 Cirò Classico </li></ul>
<p><strong>D.O.C. </strong></p>
<ul>
<li>2 Bivongi</li>
<li>3 Cirò</li>
</ul>
</div>
"""

EXPECTED_REGIONS = {
    "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia Romagna",
    "Friuli Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche",
    "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana",
    "Trentino Alto Adige", "Umbria", "Valle d'Aosta", "Veneto",
}


@pytest.fixture(scope="module")
def snapshot() -> dict:
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


def test_snapshot_covers_all_twenty_regions(snapshot):
    regions = {r["region"] for r in snapshot["regions"]}
    assert regions == EXPECTED_REGIONS
    # No region appears twice — Piemonte's four pages and Toscana's two are
    # merged into one region each.
    assert len(snapshot["regions"]) == 20


def test_snapshot_carries_an_updated_stamp(snapshot):
    assert snapshot["updated"] == "2026-01"


def test_every_region_lists_docg_and_doc(snapshot):
    for region in snapshot["regions"]:
        assert isinstance(region["DOCG"], list)
        assert isinstance(region["DOC"], list)
        # No duplicates within a region's own lists.
        assert len(region["DOCG"]) == len(set(region["DOCG"]))
        assert len(region["DOC"]) == len(set(region["DOC"]))


def test_calabria_sole_docg_is_ciro_classico(snapshot):
    """The snapshot the n=425 correction cites: Calabria's only D.O.C.G. is
    Cirò Classico, which is why the corrected answer is "1 - Cirò Classico."."""
    calabria = next(r for r in snapshot["regions"] if r["region"] == "Calabria")
    assert calabria["DOCG"] == ["Cirò Classico"]


def test_parser_splits_docg_from_doc_and_strips_leading_numbers():
    parser = _RegionPageParser()
    parser.feed(_PAGE_HTML)
    # Leading sequential numbers dropped, D.O.C.G. and D.O.C. kept apart
    # (D.O.C. is a prefix of D.O.C.G., so the split must not be by startswith),
    # and the stray menu <ul> ignored.
    assert parser.docg == ["Cirò Classico"]
    assert parser.doc == ["Bivongi", "Cirò"]


def test_parser_is_deterministic_across_runs():
    """Re-parsing the same bytes yields the same lists — the property that
    makes re-running the snapshot script against unchanged pages produce a
    byte-identical file."""
    first = _RegionPageParser()
    first.feed(_PAGE_HTML)
    second = _RegionPageParser()
    second.feed(_PAGE_HTML)
    assert (first.docg, first.doc) == (second.docg, second.doc)


def test_snapshot_date_reads_the_stamp_not_the_clock():
    html = "... Dati e mappe aggiornati a gennaio 2026. ..."
    assert _snapshot_date(html) == "2026-01"


def test_snapshot_date_fails_loud_without_a_stamp():
    with pytest.raises(ValueError):
        _snapshot_date("no stamp here")
