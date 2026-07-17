# Sonex Deployment Guide

## Prerequisites
- Docker & Docker Compose v2
- Node.js 20+ (for local dev)
- PostgreSQL 16
- Redis 7

## Production Stack
| Service   | Image                  | Port  |
|-----------|------------------------|-------|
| PostgreSQL| postgres:16-alpine     | 5432  |
| Redis     | redis:7-alpine         | 6379  |
| Backend   | sonex-backend:latest   | 3001  |
| Frontend  | sonex-frontend:latest  | 3000  |

## Environment Setup
```bash
cp backend/.env.production.example backend/.env
# Edit .env with production values
```

## Deploy with Docker
```bash
docker compose build
docker compose up -d
docker compose logs -f
```

## Database Migrations
```bash
# Manual (if not using Docker CMD)
cd backend
npx prisma migrate deploy

# Reset (destroys data)
npx prisma migrate reset --force
```

## Health Checks
- `GET /health` — component status (DB, Redis, queue, WhatsApp)
- `GET /health/dashboard` — HTML dashboard
- `GET /metrics` — Prometheus metrics

## Verifying Deployment
1. `curl http://localhost:3001/health` — all components "up"
2. `curl http://localhost:3000` — frontend loads
3. Test order pipeline via Telegram or API
