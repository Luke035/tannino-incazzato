# denominations.json co-located with the backend

`denominations.json` lives at `backend/data/denominations.json` rather than `frontend/src/data/` where it originated.

The file is the ingestion source for the `denomination` table — it is never imported by the frontend at runtime (the app fetches denominations from the API). Its only consumer is `scripts/ingest_denominations.py`, which runs inside the backend container.

Docker build contexts are directory-scoped: the backend `Dockerfile` can only `COPY` files from within `backend/`. Keeping the JSON in `frontend/` would require either a monorepo-wide build context (coupling the two images) or a volume mount (which breaks production deployments without additional orchestration configuration). Moving the file to `backend/data/` keeps each image's build context self-contained.

## Consequences

- `start.sh` references `$ROOT/backend/data/denominations.json` instead of `$ROOT/frontend/src/data/denominations.json`.
- If future games introduce their own denomination datasets, the same `backend/data/` convention should be followed.
