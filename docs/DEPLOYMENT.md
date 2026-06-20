# Deployment Guide

Docker Compose is the official deployment method for this repository.

## Quick start

From repo root:

```bash
cp .env.example .env
```

Edit `.env` with:

- `JWT_SECRET`
- `OPENCODE_AGENT_JWT`

Optional: run containers as your current host user/group:

```bash
export UID=$(id -u)
export GID=$(id -g)
```

Start services:

```bash
docker compose up --build -d
```

## Endpoints

- Platform: `http://localhost:3001`
- Shared fossil server: `http://localhost:8001`

## Useful commands

```bash
docker compose ps
docker compose logs -f platform
docker compose logs -f agent-opencode
curl http://127.0.0.1:3001/health
```

## Custom domain / reverse proxy

When you expose the platform on a custom domain (with TLS), there are two separate
addresses to configure — see
[CONFIGURATION.md → Internal vs external addressing](CONFIGURATION.md#internal-vs-external-addressing):

- **Internal** (`MIMO_INTERNAL_VCS_HOST`): the host the _agent_ uses to clone a
  session repo. Under Docker Compose this stays the service name `platform`.
- **External** (`MIMO_PUBLIC_VCS_URL`): the base URL the _browser user_ sees in the
  `git clone` command. Without it, the UI would show the raw internal VCS port
  (e.g. `http://yourdomain.com:8000/<sid>.git/`), which won't work behind TLS.

Serve the VCS server under a path on your main domain and point
`MIMO_PUBLIC_VCS_URL` at it:

```bash
# On the platform:
MIMO_PUBLIC_VCS_URL=https://yourdomain.com/git
```

The clone command then becomes `https://yourdomain.com/git/<sid>.git/`.

Configure your reverse proxy to route `/git/` to the internal VCS server,
**stripping the `/git` prefix** so the backend still sees `/<sid>.git/...`. Example
(nginx):

```nginx
server {
    server_name yourdomain.com;
    listen 443 ssl;
    # ... TLS config ...

    # Platform (HTTP + WebSocket)
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # VCS server — strip the /git prefix (trailing slash on proxy_pass does this)
    location /git/ {
        proxy_pass http://127.0.0.1:8001/;
        proxy_set_header Host $host;
    }
}
```

The git HTTP server enforces per-session basic auth, so the credentials embedded in
the clone URL are still required when going through the proxy.

## Migration: fossil → vcs naming

The session VCS server is Git, but several environment variables, persisted data
fields, and the on-disk repos directory were still named "fossil". These have been
renamed for clarity. **This is a breaking change for existing deployments.**

### 1. Update environment variables

| Old                              | New                      |
| -------------------------------- | ------------------------ |
| `FOSSIL_REPOS_DIR`               | `MIMO_VCS_REPOS_DIR`     |
| `MIMO_SHARED_FOSSIL_SERVER_PORT` | `MIMO_INTERNAL_VCS_PORT` |
| `MIMO_SHARED_FOSSIL_SERVER_HOST` | `MIMO_INTERNAL_VCS_HOST` |

Update these wherever you set them (`.env`, `docker-compose.yml`, systemd units, etc.).
The old names are no longer read.

### 2. Migrate persisted data

With the platform **stopped**, run the migration script on the platform host. It
moves `~/.mimo/session-fossils` → `~/.mimo/session-repos` and rewrites the renamed
YAML keys in `config.yaml`, session records, and impact records (`fossilPath` →
`vcsPath`, `fossilUrl` → `cloneUrl`, `sharedFossilServerPort` → `sharedVcsServerPort`):

```bash
cd packages/mimo-platform
bun scripts/migrate-fossil-naming.ts --dry-run   # preview
bun scripts/migrate-fossil-naming.ts             # apply
```

The script is idempotent and only touches the renamed shared-session-server data —
it does not affect genuine Fossil repositories (`repoType: fossil`).

> Note: the `session_ready` protocol field `fossilUrl` was renamed to `cloneUrl`,
> so platform and agent must be upgraded together.

## Stop

```bash
docker compose down
```
