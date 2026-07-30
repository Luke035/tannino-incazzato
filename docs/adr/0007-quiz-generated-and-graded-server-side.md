# Quiz sessions are generated and graded entirely server-side

Mappa dei Vini downloads every denomination with its correct regions and decides correctness in
the browser. Promossi o Cirrotici does the opposite: the backend draws the questions, persists
the Session, and serves the questions **without their correct answers**; the player submits
answers and the backend produces every Verdict.

The reason is that this game emits a pass/fail result. A grade computed in a context the player
controls is not a grade. Open Questions have to be judged server-side anyway (that is where the
model credentials live), so the boundary was going to be split regardless — putting all of it on
one side removes the split rather than creating one.

## Considered Options

**Client-side grading for Closed Questions, server-side for Open ones** — coherent with the
existing game and instant on the 16 closed questions, but it ships the correct answers of 16
questions out of 30 in the payload, and the backend would still have to store a score that the
client computed.

**Server-side grading without persisting the in-progress Session** — fewer writes, no pending
state to reason about. Rejected because it forfeits resuming an interrupted Exam, which this
game cannot do without: it is mobile-first, and on a phone interruption is the norm.

## Consequences

- The Session must exist in the database before it has a score, which `game_sessions` cannot
  express — see ADR 0008.
- Correctness lives in the backend for this game and in the frontend for Mappa dei Vini. This
  asymmetry is deliberate and should not be "fixed" by unifying them: only one of the two games
  certifies anything.
- Multiple-choice options are shuffled server-side before being served. In the source bank the
  correct option is always the first one, so serving them in source order would make every
  multiple-choice question trivially guessable.
