# The federdoc sweep: finding stale denomination answers in the Question Bank

Some of the bank's answers about Italian DOC/DOCG denominations are stale — a denomination
renamed, promoted, or created since the sheet was written. The federdoc snapshot
(`backend/data/federdoc_snapshot.json`, ADR 0012) is the dated authority that says what is true
today. The **sweep** is the offline pass, run once, that reads the bank against that snapshot,
finds every answer the snapshot contradicts, and lands the fixes in the corrections file
(`backend/app/questions/corrections.py`). There is no runtime model call and no external model in
the request path — the sweep is producer work, committed as data, exactly like the classification
of `docs/question-bank-classification.md`.

This document records how the sweep was produced, what the snapshot can and cannot adjudicate, and
how a later correction is made.

## What the snapshot can and cannot adjudicate

The snapshot's authority is **narrow, and the sweep must not exceed it.** It can adjudicate:

- whether an Italian denomination **exists**,
- what it is **called**,
- which **region** it belongs to,
- whether it is **DOC or DOCG** (the tier).

It **cannot** adjudicate, and the sweep never modifies a question turning on:

- **IGT** — federdoc does not list them at all;
- **grape** varieties or percentages;
- **ageing / maturation** requirements;
- **sub-zones**, disciplinare detail, or a wine's styles/versions (Riserva, Satèn, Superiore *as a
  style*);
- anything **outside Italy**.

A question that looks stale but falls outside that authority is **left alone and reported**, never
guessed at — its verdict is `outside_authority`. The snapshot is the only source consulted; nothing
is corrected on the strength of general knowledge.

## The net that was cast

Candidate selection is **mechanical, deterministic, and committed**, so a reviewer can see the net
the sweep cast before any judgement was applied. `backend/scripts/select_denomination_candidates.py`
reads the committed seed CSV and the snapshot and writes
`backend/data/denomination_sweep_candidates.csv`. Re-running it against the same two files produces
a byte-identical result; a data-integrity test
(`backend/tests/test_denomination_sweep.py`) pins the committed file to the script's output so it
can never drift.

Two independent selectors are unioned:

- **Token** — every question whose text or reference answer mentions a tier token (DOC, DOCG, IGT,
  and their dotted and spelled-out forms). These are the questions that talk about denomination
  tiers at all.
- **Denomination** — every question whose text or reference answer mentions a denomination *name*
  the snapshot lists (e.g. "Cirò", "Barolo"), whether or not it uses a tier token. This catches a
  question that asserts a wine's tier without ever writing "DOCG".

The union is **369 questions** — roughly a fifth of the bank; the token half alone is 214. (The
issue that scoped this pass estimated 405 and 225 by hand; the committed script is the authority,
and its deterministic count is what stands.) The net is deliberately wide: a false positive costs
nothing (it gets an `unchanged` verdict), while a false negative is a wrong answer left in the
bank. IGT is inside the *net* even though the snapshot cannot adjudicate it — an IGT question that
looks stale is still seen, then reported as `outside_authority`. The denomination selector also
matches on ordinary words that happen to be denomination names (the adverb *noto*, the city
*Venezia*); those questions are looked at and left alone, which is the intended cost of a wide net,
not a defect.

## How the verdicts were produced

Following the precedent of the offline classification (#14), the candidates were split into six
chunks and worked by parallel agents under **one identical brief**. The brief gave each agent the
snapshot, the four verdicts, the narrow-authority rule, and the three fields a correction may set —
nothing chunk-specific. The split was for context and cost only; no chunk's verdicts are more
authoritative than another's. No external model was involved and nothing here adds a runtime model
call.

Every candidate carries exactly one recorded verdict, committed in
`backend/data/denomination_sweep_verdicts.csv`:

| Verdict | Count | Meaning |
|---|---|---|
| `unchanged` | 250 | The stored answer agrees with the snapshot, or the snapshot is silent and does not contradict it. |
| `outside_authority` | 114 | The question touches denominations but turns on something the snapshot cannot adjudicate. Left alone, reported. |
| `corrected` | 5 | The snapshot contradicts the stored answer on existence/name/region/tier; an entry in the corrections file fixes it. |

Each `corrected` and each `outside_authority`-adjacent verdict records the snapshot **region** and
**entry** it rests on. A sample of the verdicts — the five corrections in full, plus a random
sample of `unchanged`/`outside_authority` rows — was spot-checked by hand before the result was
treated as data; that sample is recorded in the pull request.

### The three shapes a correction meets

The sweep met all three shapes scoped for it, and the five corrections are one of each plus two
more:

- **A list answer carrying a wrong tier** — n=1 *"Example question 1?"* listed "Colli di
  Conegliano", a Veneto **DOCG**, and listed it twice. Both DOCG occurrences were removed; because
  the question asks for *ten* DOCs and is graded as a `list` (it needs ten valid items to be
  answerable), one real Veneto DOC from the snapshot — Bardolino — was substituted to keep the
  count. Every name in the corrected answer is a DOC the snapshot lists for Veneto; the substitute
  is drawn from the snapshot, not invented, so the correction stays inside the snapshot's authority
  rather than editorialising.
- **A renamed denomination** — n=285 *"[question text removed]"* named "Albana di
  Romagna", now "Romagna Albana" in the snapshot. Only the name was corrected.
- **A True/False answer that flips** — n=713 *"[question text removed]"* — Rosso
  Cònero is a DOC, "Cònero" is the DOCG, so the statement is false; the stored `VERO` was flipped
  to `FALSO`, and its explanation (which had asserted "DOCG dal 2004") corrected in the same entry
  so the rationale no longer contradicts the answer.
- **A wrong count with the right option present** — n=1791 *"Quante sono le DOCG dell'Abruzzo?"* —
  the snapshot lists three, the stored answer was "Due", and "Tre" is one of the served options, so
  the answer key was corrected to it; its explanation, which had named only two DOCG, was corrected
  in the same entry to name all three.
- The fifth, n=425 (Calabria's sole DOCG, Cirò Classico), was landed earlier by the mechanism
  slice (#34) before the sweep ran; the sweep independently reached the same verdict.

## What a correction may touch, and what it may not

A correction may set **`reference_answer`, `explanation`, or `open_subtype` only** — the rule ADR
0012 and `docs/question-bank-classification.md` already hold. It may never change `text` or
`options`: changing options would leave `exam_answers.served_options` describing a paper that no
longer exists, and changing the text would destroy the correction's own key. A question that would
need one of those is **deactivated** (`active = false`) instead. Where a correction turns a
reference answer from a statement into an enumeration, `open_subtype` moves to `list` in the same
entry, so the grading agent stops applying the `conceptual` criterion to a list.

The sweep's own restraint is sharper still: because the snapshot cannot adjudicate spelling, a
correction touches **only the denomination fact the snapshot owns**. n=1 kept the "Custozza"
misspelling and n=285 kept "Giminiano" — fixing a typo is outside the snapshot's authority, so the
sweep leaves it for a human or the admin panel (ADR 0013).

## How a later correction is made

The corrections file is **append-only** (ADR 0012). A new stale answer — found by a future snapshot,
or missed by this pass — is fixed by **appending** a `FieldCorrection` (or a `Deactivation`) to
`CORRECTIONS` in `backend/app/questions/corrections.py`, never by editing an existing entry, and
never by editing the seed CSV. The entry's `old` is what the database is expected to hold — what
the CSV loaded, or what the previous entry touching that question wrote — and the data-integrity
test (`backend/tests/test_question_bank_corrections.py`) verifies the per-question chain is
unbroken over the whole file. Re-running the sweep's selection script after a snapshot refresh
re-derives the candidate list deterministically, so the net is always current with the committed
inputs.
