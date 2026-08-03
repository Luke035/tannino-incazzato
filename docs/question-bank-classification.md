# Question Bank classification: topic and open_subtype

The Question Bank carries two classifications the source sheet does not: every question's
`topic`, and every Open Question's `open_subtype` (`conceptual` | `list`). Both are produced
**offline**, once, and committed as seed data — there is no runtime model call and the app never
classifies a question itself. This document records the taxonomy, the rule for assigning a
single topic, how the classification was produced, and how a correction is made afterwards.

## The topic taxonomy

Every question carries exactly one topic, chosen from this fixed set. The taxonomy is defined
once, in code, as `TOPICS` in `backend/app/questions/model.py` — `backend/scripts/merge_classification.py`
and the data-integrity test (`backend/tests/test_question_bank_classification.py`) both import
that constant rather than keeping their own copy.

| Slug | Covers |
|---|---|
| `viticulture` | Growing the grape: vine varieties, soil, climate, training and canopy systems, yields. |
| `winemaking` | Turning grapes into wine in the cellar: fermentation, aging, blending, cellar technique not specific to sparkling production. |
| `sparkling_wines` | Production methods and classification specific to sparkling wine: metodo classico, Charmat, spumante/frizzante distinctions. |
| `italian_regions` | Italian denominations and their geography: DOC/DOCG zones, and the grapes and rules tied to a specific Italian region. |
| `foreign_regions` | Non-Italian wine regions and denominations: appellations, classifications and geography outside Italy. |
| `tasting` | Sensory analysis of wine: sight, smell, taste, structure, tasting terminology and technique. |
| `service` | The sommelier's table practice: glassware, temperature, decanting, opening and serving wine. |
| `food_pairing` | Matching wine and food: pairing principles and specific pairings. |
| `spirits` | Distillates and liqueurs — production and characteristics of spirits, not wine. |
| `legislation` | Wine law: DOC/DOCG/IGT classification rules, labeling requirements, certification criteria. |

## The single-topic rule

A question carries **one** topic — the one it is most centrally about, never a list of
everything it happens to mention. A question that names a denomination while really asking about
a labeling rule is `legislation`, not `italian_regions`; a question is classified by what it is
testing, not by every noun in its text.

### Tie-break ladder

This is the exact rule the classification agents were given, and the rule the committed data was
produced under — not a taxonomy design choice made after the fact. When a question legitimately
sits on the boundary between two topics, the earliest match in this list wins:

1. `spirits` (subject is a distillate, liqueur, or beer)
2. `food_pairing`
3. `tasting`
4. `service`
5. `sparkling_wines`
6. `legislation`
7. `italian_regions` / `foreign_regions`
8. `winemaking`
9. `viticulture`

The principle behind the ordering: the more specific craft/context topic wins over the more
general subject matter. A question about serving a sparkling wine is `service`, not
`sparkling_wines`; a question about how a sparkling wine is produced is `sparkling_wines`, not
`winemaking` or the region it comes from. `italian_regions`/`foreign_regions` outrank the two most
general buckets (`winemaking`, `viticulture`), which serve as the fallback for anything about
growing or making wine that is not tied to a specific region, process, or practical context above
them in the list.

Worked examples, the ones the classifiers were held to:

| Question | Topic | Why |
|---|---|---|
| "How is Champagne produced?" | `sparkling_wines` | Production process beats the region it's from. |
| "At what temperature is a spumante served?" | `service` | Serving practice beats the product category. |
| "Which grapes are grown in Veneto?" | `italian_regions` | Tied to a specific Italian region, not generic viticulture. |
| "What is invaiatura?" | `viticulture` | Generic vine biology, tied to no region or process above it. |
| "Labelling requirements for a DOCG" | `legislation` | Law beats the region named in the question. |

## How the classification was produced

Both classifications — `topic` for all 1851 questions, `open_subtype` for the 453 Open Questions —
were produced **offline**, once, by agents reading the committed bank
(`backend/data/question_bank.csv`) directly and applying the taxonomy and tie-break ladder
above to every row. The bank was split into 13 chunks of 150 questions and worked by three agents
under the identical brief above: one covering chunks 1-5, and two more covering chunks 6-9 and
10-13 in parallel. The split was purely for context-window and cost reasons — how much of the bank
fits through one agent's context and budget in a single pass — not an editorial one: every chunk
was worked under the identical brief and no chunk's classification is more or less authoritative
than another's. A sample was spot-checked by hand before the result was treated as data. There is no
runtime model call and no external model in the request path: the app never classifies a question
itself, at seed time or at request time. The enriched result is merged into the committed CSV by
`backend/scripts/merge_classification.py` and served exactly like every other column in the bank
from then on.

The initial pass saw only the question stem, and for a short multiple-choice stem that is
sometimes not enough — "LVB è una classificazione del:" only reads as `foreign_regions` once you
see the correct answer is Porto. The 272 multiple-choice questions with the shortest stems (under
45 characters) were re-read by a dedicated pass that saw the options and the correct answer as
well, under the same taxonomy and ladder, and that pass's topic wins wherever it disagrees with
the first one. This override is multiple-choice-only by construction — Open and True/False
questions carry enough context in the stem alone — and is applied by `merge_classification.py`
itself; there is no separate merge step for it.

`merge_classification.py` is deterministic and re-runnable but is **not** a boot-time step — it is
run by hand, once, when a classification (or a correction to one) is ready to land, and its output
is committed. It validates the whole bank before writing anything: every `n` must be classified
exactly once, every topic must be in the taxonomy, every Open Question must carry a subtype while
no other question may, and every override must name a question the base pass already classified
and must not touch anything but a multiple-choice question.

## Correcting a classification

The database is the source of truth for the bank once it is seeded (ADR 0009) — the same rule
that applies to a question's text, answer, or explanation applies to its `topic` and
`open_subtype`. A correction is made directly against the `question` table, never by editing the
CSV and re-seeding: `seed_questions.py` only ever runs once per database (ADR 0011), and the CSV
is not treated as describing what is being served after that point.

The one exception is a database that was seeded *before* a classification (or a correction to it)
landed in the CSV. `backend/scripts/backfill_question_classification.py` closes that gap: it runs
on every boot, right after `seed_questions.py`, and fills in `topic`/`open_subtype` only where a
row currently has `NULL` — it never overwrites a value already set, so a correction made directly
in the database is never clobbered by a later boot.
