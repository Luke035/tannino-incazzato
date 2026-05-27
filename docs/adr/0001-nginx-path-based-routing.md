# nginx as reverse proxy with same-domain path-based routing

All traffic enters through a single nginx container. Requests to `/api/` are proxied to the FastAPI backend (nginx strips the prefix); all other requests go to the Next.js frontend. Both services are reachable only via the internal Docker network — nginx is the only container that exposes a port.

## Considered Options

**Subdomain routing** (`app.example.com` → frontend, `api.example.com` → backend) was the main alternative. It was rejected because it requires DNS configuration and a separate TLS certificate per subdomain, and it forces `NEXT_PUBLIC_API_URL` to be an absolute URL that must be baked into the frontend image at build time — meaning separate images per environment.

With path-based routing on the same origin, `NEXT_PUBLIC_API_URL` is set to the relative path `/api` and hardcoded in the frontend `Dockerfile`. The same image works in every environment without rebuild. CORS is also a non-issue in production because all browser requests stay on the same origin.

## Consequences

- nginx must strip the `/api` prefix before forwarding to FastAPI (`proxy_pass http://backend:8000/`). FastAPI routes have no `/api` prefix and must not be given one.
- TLS termination is intentionally outside this stack (handled by a load balancer, CDN, or VPS host). nginx listens on port 80 only.
- In `start.sh` (non-Docker dev), `NEXT_PUBLIC_API_URL=http://localhost:8000` still points directly to FastAPI. This divergence is acceptable — `start.sh` is for hot-reload development only.
