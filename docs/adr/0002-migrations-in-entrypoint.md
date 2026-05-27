# Alembic migrations and data ingestion run in the backend container entrypoint

The backend container's entrypoint script runs `alembic upgrade head` and `ingest_denominations.py` before starting `uvicorn`. The container is not considered healthy until both complete.

## Considered Options

**Init container** (a separate Docker service with `condition: service_completed_successfully`) was the main alternative. It was rejected as over-engineering for a single-service backend with a fast, idempotent migration history. The complexity of an extra service outweighs the cleaner separation.

**Running migrations in CI/CD** (before deploying the new image) was also considered. Rejected because it couples the deployment pipeline to database access, requires credentials in CI, and makes local Docker Compose startup require an external step.

The entrypoint approach keeps the container self-contained: any replica that starts is guaranteed to have run migrations, and the ingestion script is idempotent so running it multiple times is safe.

## Consequences

- The backend service depends on the `db` service with `condition: service_healthy`. A `pg_isready` healthcheck is required on the `db` service.
- Cold starts are slightly slower (migration + ingestion time before uvicorn accepts requests). This is acceptable — nginx returns 502 briefly, not a crash.
