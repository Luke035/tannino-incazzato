# A user carries three independent axes: account state, role and plan

A user is described by three separate, independent facts — whether the account may be used at all
(**suspended** or not), what they may govern (**player** or **admin**), and what they are entitled
to use (**free** or **premium**) — rather than by a single role field enumerating the combinations.
All three are read from the database on every authenticated request; none of them is carried in the
session token.

## Why three fields and not one enum

The obvious shape is one `role` column holding `player | admin | premium`. It fails on the first
question asked of it: **is an admin also premium?** Either that becomes an unwritten rule — and
then the one person who most needs to see the free experience, in order to check it, can no longer
see it — or a fourth value `admin_premium` appears and the combinations multiply. Suspension breaks
it a second time: a suspended admin must stay suspended, and `role = admin` has no room to say so.

They are also not the same kind of fact. Suspension is an operational act, taken and undone by an
admin. A role is near-permanent and says what someone may govern. A plan is commercial: it will one
day expire, renew, and carry a history. Collapsing three lifecycles into one column means the
shortest-lived of them dictates the shape of the other two.

## What is decided now and what is not

`plan` exists from the outset and is **dormant**: the panel displays and changes it, and no check
anywhere reads it. No user gains or loses anything. It exists so that the day premium is defined,
the answer is a rule and a migration, not a re-modelling of the user.

The constraint that day must respect is recorded here, because it is not visible from the code and
it is easy to get catastrophically wrong. **"Turn the AI off" is not one thing.** There are two
kinds of AI in this product and they behave in opposite ways:

- **Ornamental AI** — `/hint`, `/memorize` and `/review`, all of them Mappa dei Vini. Withheld, the
  game is identical and merely plainer. It degrades gracefully.
- **Constitutive AI** — the grading of Open Questions in Promossi o Cirrotici. The Exam is fourteen
  open questions out of thirty; Practice and Error Review mark every answer as it is given. Without
  the model there is no game.

The second cannot be withheld, and the reason is a rule the product already holds: *an ungraded Open
Question is never counted wrong — the session simply carries no score*. A free user denied grading
would therefore not receive an error. They would receive a **paper that is never marked**, forever,
which is a worse outcome than being refused outright. Any future premium must gate on volume — a
number of graded sessions in a window — or on ornamental AI alone. It must never gate grading
itself.

## The database is the authority; the token carries nothing new

The session JWT holds only the subject and an expiry, and lasts seven days with no revocation. Had
`role` or the suspension flag been minted into it, suspending an account would take effect up to a
week later — a uselessly slow answer for a flag whose entire purpose is to remove someone now. So
the authenticated dependency loads the user row on every request and reads the three axes from it.
The cost is one primary-key lookup per authenticated request; the benefit is that there is exactly
one place where the truth about a user lives, and it takes effect immediately.

Two rules follow, and neither is optional:

- **The user entity never leaves the process.** Endpoints serialise `UserRead` (extended with the
  three axes, which a user is entitled to know about themselves) and the admin listing serialises a
  schema of its own. The password hash and the Google id are never in a response, to anybody,
  including an admin. Keeping the admin listing on a separate schema means the only way to add a
  sensitive field to it is to type it out — a deliberate act, visible in review.
- **Suspension is enforced per resource, not globally.** A suspended user signs in and reaches the
  home screen; the games are shown greyed and their endpoints refuse. A blanket refusal would also
  refuse the call that identifies them, leaving them at a login screen with no explanation of what
  happened. The refusal is mounted as one dependency on the game routers rather than written
  endpoint by endpoint, and every new game router mounts it.

## Considered Options

**Roles as a set per user** (`{admin, premium}`), avoiding combined enum values. Rejected: it keeps
two unrelated kinds of fact in one structure, turns every check into a membership test, and needs a
UI for editing sets in exchange for flexibility nothing has asked for.

**A separate entitlement table** carrying grants with validity windows. This is where the plan axis
should go the day premium is actually sold — it is the only shape that handles expiry, renewal,
refunds and granular grants. Rejected for now as infrastructure to build and administer for zero
paying customers; `plan` is a column until then, and widening it into a table later does not disturb
the other two axes.

**Minting the axes into the JWT** for a gate at the edge and zero queries. Rejected on revocation
latency, as above.

**Blocking a suspended user at login.** Simplest of all, and it denies the one thing the suspension
is supposed to communicate: the user hits a login screen and learns nothing.

## Consequences

- Suspension takes effect on the next request, not on the next login.
- `plan` will read `free` for every user for as long as premium is undefined. That is intended, and
  this ADR is the answer to anyone who finds the column and wonders whether it is dead.
- Administration is bootstrapped from configuration: an email named in the environment is promoted
  **only when no admin exists at all**. It never demotes and never overrides a decision made in the
  panel — it fills a vacuum, including the vacuum an admin creates by demoting themselves. The
  account must already have been registered; the bootstrap promotes a user, it does not create one.
- Four endpoints — `/hint`, `/memorize`, `/review` and `/denominations` — are unauthenticated today
  and must be closed before any of this means anything: suspension cannot withhold a game whose
  endpoints do not ask who is calling, and neither can a plan. It is also a live cost exposure, as
  the three AI endpoints spend against the Gemini quota for anyone on the internet. Closing them is
  a change to the API perimeter and is tracked as its own prerequisite, not folded into the panel.
