# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **single-context**: one `CONTEXT.md` at the root, one `docs/adr/` directory.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the shared glossary (brand, product, and domain terms; meanings, not implementation details).
- **`docs/adr/`** — read the ADRs that touch the area you're about to work in:
  - `0001-nginx-path-based-routing.md`
  - `0002-migrations-in-entrypoint.md`
  - `0003-denominations-json-in-backend.md`
  - `0004-docker-image-tagging-strategy.md`
  - `0005-coolify-deployment.md`
  - `0006-game-chooser-home-and-english-slugs.md`

`CLAUDE.md` remains the operational guide (how to run, test, and build the project, plus hard conventions). `CONTEXT.md` and the ADRs cover meaning and decisions — read them for *why*, read `CLAUDE.md` for *how*.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   │   ├── 0001-nginx-path-based-routing.md
│   │   └── …
│   └── agents/          ← this file, issue-tracker.md, triage-labels.md
├── frontend/
└── backend/
```

There is no `CONTEXT-MAP.md`. If this repo ever splits into multiple bounded contexts, add one at the root pointing at a per-context `CONTEXT.md`, and let context-scoped decisions live in that context's own `docs/adr/`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids — e.g. write **Tannino Incazzato** for the platform and **Mappa dei Vini / Wine Map** for the game, not "Sommelier Game" (which survives only as the repo folder, package, and database name).

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0003 (denominations JSON lives in the backend) — but worth reopening because…_
