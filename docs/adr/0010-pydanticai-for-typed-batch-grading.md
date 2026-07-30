# PydanticAI grades Open Questions, alongside google-genai

Judging the Open Questions of a submitted Session is done through a PydanticAI agent with a
typed result, in **one call carrying every Open Question of that Session**. The existing AI
endpoints — `/hint`, `/memorize`, `/review` — stay on `google-genai` with free-text prompts.
The backend therefore has two ways of talking to a model, on purpose.

Grading is the only AI call in the product whose output is load-bearing: it decides a pass or a
fail. Free-text parsing is not acceptable there, and PydanticAI provides schema validation with
automatic retry on a malformed result rather than a schema that merely describes the output.

## Considered Options

**`response_schema` with Pydantic models on the existing `google-genai` client** — genuinely
typed, zero new dependencies, same shape as the code already in `backend/app/ai/gemini.py`.
This was the recommendation; it was rejected in favour of an explicit agent abstraction with
validation retries built in.

**Migrating `/hint`, `/memorize` and `/review` onto PydanticAI too** — coherent, but it is a
refactor of working code smuggled inside a new feature.

**One call per Open Question instead of one batched call** — isolates failures and keeps each
prompt short. Rejected for cost and latency: roughly fourteen requests on every submission.

## Consequences

- A typed schema stops malformed output, but not a model that returns a well-formed verdict
  against the wrong question, and not the dilution of a prompt carrying fourteen reference
  answers (some over 2000 characters). Each item therefore carries its question id, and the
  returned set is checked against the sent set; anything missing or mismatched is re-graded with
  a single-question call.
- A batch that fails outright leaves the Session ungraded and retryable. A Verdict is never
  defaulted to "not acceptable" because a model call failed — a timeout must not fail a
  candidate.
- Anyone adding AI features must now choose between two stacks. The rule is: load-bearing,
  structured output goes through PydanticAI; conversational output stays on `google-genai`.
