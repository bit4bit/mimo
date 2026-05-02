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

## Stop

```bash
docker compose down
```
