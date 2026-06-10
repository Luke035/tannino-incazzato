# Production deployment on Coolify with managed Postgres and Traefik-fronted nginx

The app is deployed to a self-hosted Coolify server on the domain tanninoincazzato.it. Coolify's built-in Traefik proxy terminates TLS (Let's Encrypt) and forwards to the existing nginx container on port 80; nginx keeps doing same-domain path-based routing as described in ADR 0001. There are intentionally two reverse proxies: Traefik owns TLS and the public domain, nginx owns app-internal routing — this keeps ADR 0001 (and the `NEXT_PUBLIC_API_URL=/api` baked image) completely unchanged.

The server is shared with another app (salonify / gestionale.hair-garage.it, see `../../hg_migration`), so routing is declared with **explicit Traefik labels** on the nginx service rather than Coolify's per-service domain field: the nginx container joins the external `coolify` network and carries an HTTPS router (`Host(tanninoincazzato.it) || Host(www.…)`, `certresolver=letsencrypt`), a `www → apex` redirect, and an `http → https` redirect. All router/middleware names are prefixed `sommelier-` to avoid collisions with the co-hosted app on the same Traefik instance.

## Considered Options

**Dropping nginx and using Traefik path rules directly** was rejected because it would re-implement the `/api` prefix-strip in Traefik middleware and contradict ADR 0001, for the marginal gain of one fewer container.

**Building images on the Coolify server** (instead of pulling) was rejected because CI already publishes images to ghcr.io; building again duplicates work and needs a build toolchain on the VPS. Coolify pulls the pre-built `latest` images via `infra/docker-compose.prod.yml`. The packages are private, so a GitHub PAT (`read:packages`) is registered as a ghcr.io registry credential in Coolify. Deploys are triggered by a webhook called from the `docker-publish.yml` workflow after the images are pushed.

**Keeping Postgres in the compose stack** (as the dev compose and ADR 0002 do) was rejected for production in favour of a Coolify-managed Postgres 17 instance, which provides scheduled backups and lifecycle management. Consequently the prod compose has no `db` service and `DATABASE_URL` is an external secret. ADR 0002's entrypoint migrations still run on every backend start; the lost `depends_on: service_healthy` gate is acceptable because the entrypoint's `alembic upgrade head` simply crash-restarts until the managed DB is reachable.

## Consequences

- Production pins to `latest` for rolling deploys; the immutable SHA tag (ADR 0004) remains available for manual rollback.
- The session cookie's Secure flag is environment-driven (`COOKIE_SECURE`): `true` in production behind HTTPS, `false` for local HTTP dev.
- Local dev Postgres was bumped from 16 to 17 to match production; existing local volumes must be recreated once.
