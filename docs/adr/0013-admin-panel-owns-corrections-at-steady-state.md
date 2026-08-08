# The admin panel owns Question Bank corrections at steady state

An authenticated admin panel writes corrections to a question straight to the database and is,
from the moment it exists, **the** way a question is corrected. The committed corrections file of
ADR 0012 is retained for what it is good at — a bulk remediation run against a dated external
authority — and is not the everyday path.

This settles a contradiction the two preceding ADRs would otherwise leave standing. ADR 0009 said
correcting a question means a query against production *until an admin panel exists*. ADR 0012
amended that: a correction "no longer means a query against production — it means an append to the
corrections file, reviewed and merged like any other change." Both statements were right when
written, and together they leave two mechanisms each claiming to be how a question is corrected.
This ADR says which one is which.

## Who owns what

- **The panel owns a correction.** A typo spotted in a reference answer, a multiple choice carrying
  two options instead of three, a question that turns out to be wrong: an admin fixes it, alone,
  and it takes effect immediately.
- **The corrections file owns a remediation.** A sweep of the bank against the federdoc snapshot,
  where the authority is an external dated document, the change is mechanical, the volume is large
  and the reasoning belongs in review. Issues #34, #35 and #36 are exactly that: a one-off pass
  over a bank whose denominations had aged, not a standing workflow.

The two never fight, because the apply script already writes only where the database still holds
the old value a correction expected. An edit made in the panel therefore turns the matching entry
in the corrections file into a no-op rather than being clobbered by it. That guard was written in
ADR 0012 to protect hand-run production queries; it protects the panel for the same reason.

## The panel may change `text` and `options`; the corrections file still may not

ADR 0012 forbids both fields, for two reasons that must be separated, because only one of them
generalises:

- *Changing the text would destroy the correction's own key.* True of the file, whose key **is**
  the question text. Not true of the panel, which holds the row's identity. **The panel may change
  the text.**
- *Changing the options would leave `exam_answers.served_options` describing a paper that no longer
  exists.* Read against the code, this describes what `served_options` is **for**. `_read_question`
  serves a player the options from their own stored snapshot, never from the live question, and
  `mark_answer` validates their answer against that same snapshot. A past paper therefore stays
  readable exactly as it was sat, and a live session keeps the options the player already has in
  front of them. **The panel may change the options.**

## The hazard is `reference_answer`, and it is worse than the one ADR 0012 accepted

`grade_closed` compares a player's answer to `question.reference_answer` read **live at submit**,
while the options that player may choose from come from their stored snapshot. Changing the
reference answer of a multiple choice that someone has open therefore does more than change a
verdict: if the new correct answer is not among the three options that player was served, **no
choice available to them can be right**. The paper has become unpassable, silently.

ADR 0012 accepted "a correction landing between a player's answer and their submit changes that
answer's verdict". That is a smaller thing than this, and it happened only at boot — that is, at a
deploy. A panel moves it to any moment of any day, with players mid-exam. The frequency changes,
so the mitigation must too:

- Saving a question that appears in one or more sessions in progress **warns and asks for
  confirmation**, naming how many.
- For every such session that has **not yet answered** that question, the stored snapshot is
  **resynchronised** to the new options. Those players get the corrected paper and no unpassable
  question.
- For those who have already answered, ADR 0012's accepted hazard stands: their verdict may change,
  and the new verdict is the right one.

## Considered Options

**The panel generates entries in the corrections file instead of writing to the database.** Keeps
every correction versioned, reviewed and reproducible — the property ADR 0012 was built for.
Rejected: it makes a one-line typo fix require a commit, a review and a deploy, and it forces the
panel to hold write access to the repository. The panel exists precisely to remove that ceremony.

**Two lanes split by field**, with the file keeping `reference_answer`/`explanation`/`open_subtype`
and the panel restricted to activation. Rejected: it leaves an admin unable to fix the very defects
the panel is for, and it commits the project to explaining two correction mechanisms forever.

**Refusing to save a question that is in a session in progress.** Rejected: sessions in progress
never expire by design, so a single player who abandoned a tab in March would make that question
uncorrectable indefinitely.

## Consequences

- **The seed CSV plus the corrections file no longer reconstruct the live bank.** They reconstruct
  the bank as it was before an admin first touched it. From this ADR onward the only faithful copy
  of the production bank is a database backup, which makes backups load-bearing in a way they were
  not before. ADR 0009 already noted there is no versioned file in git describing the live bank;
  this widens that gap deliberately.
- **A correction loses its git history**, and with it the review, the diff and the authorship that
  ADR 0012 counted as its advantages. This is recovered in part, and only in part, by an
  append-only admin action log recording who changed which field of which entity, from which value
  to which — see ADR 0014's companion decisions. It is half of what git gave, and it is the half
  that answers "what did this say before?".
- The corrections file stays wired into boot and stays idempotent. It is not deprecated: the next
  external-authority sweep will use it again.
- The panel may create questions, so the bank stops being, by construction, only the body of
  certified course questions. A question therefore carries its **Provenance** — certified or
  authored — so that the distinction survives as data rather than as a memory.
