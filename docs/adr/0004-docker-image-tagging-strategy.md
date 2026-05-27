# Docker image tagging strategy: `latest` + short SHA

Every merge to `main` produces two Docker images (`backend` and `frontend`) pushed to ghcr.io. Each push receives two tags: `latest` (mutable, always points to the most recent build) and the short commit SHA (immutable, e.g. `abc1234`).

## Considered Options

**Semantic versioning** (`v1.2.3`) was the main alternative. It was rejected because it requires a manual or automated release step (e.g. `semantic-release`) that does not yet exist in this project. Introducing semver without a release process would mean tags are either manual and forgotten or automated but require additional tooling and conventions (Conventional Commits enforcement, changelog generation). The overhead is not justified at this stage.

**SHA-only** (no `latest`) was also considered. It was rejected because it makes it impossible to know which image is current without querying the git log. A server running `docker-compose pull` would never receive updates.

The `latest` + SHA combination gives the best of both: `latest` is enough for a `docker-compose pull && docker-compose up` deploy, and the SHA tag enables precise rollback (`docker pull ghcr.io/luke035/sommelier_game/backend:abc1234`) without touching the registry.

## Consequences

- `latest` is overwritten on every merge to `main`. It is not safe to pin a production deploy to `latest` long-term; use the SHA tag for pinned deploys.
- When `semantic-release` is introduced, the tagging action (`docker/metadata-action`) can be extended with a `type=semver` rule without removing the SHA tag. `latest` will then be superseded by the semver `type=raw,value=latest,enable=${{ startsWith(github.ref, 'refs/tags/') }}` pattern.
- Both images are always rebuilt and pushed together, even if only one service changed. This ensures `latest` for both images always corresponds to the same commit.
