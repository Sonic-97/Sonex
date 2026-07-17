# Sonex Operations Guide

## Backup Procedure
```bash
# Database
docker compose exec postgres pg_dump -U cafe_user cafe_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Redis (AOF persistence enabled by default)
docker compose exec redis redis-cli SAVE
# Redis data is in docker volume redis_data
```

## Restore Procedure
```bash
# Database
cat backup_20260717_120000.sql | docker compose exec -T postgres psql -U cafe_user cafe_db

# Full reset
docker compose down -v  # WARNING: destroys all data
docker compose up -d
```

## Rollback Procedure
```bash
# Revert backend to previous version
docker compose down backend
docker tag sonex-backend:latest sonex-backend:current
docker tag sonex-backend:previous sonex-backend:latest
docker compose up -d backend

# Revert database migration
cd backend
npx prisma migrate resolve --rolled-back "migration_name"
```

## Incident Checklist
1. **System down** — Check `docker compose ps` for stopped services
2. **Database errors** — Check `docker compose logs postgres`; verify disk space
3. **Redis errors** — Check `docker compose logs redis`; OOM killer?
4. **High latency** — Check `/metrics` for pipeline histograms; scale backend replicas
5. **Failed prints** — Check `/health` for printer status; verify ESCPOS network
6. **AI not working** — Check `DEEPSEEK_API_KEY` in .env; verify API reachability
7. **Orders not processing** — Check `docker compose logs backend` for pipeline errors

## Deployment Checklist
- [ ] `.env` configured with production values
- [ ] `DATABASE_URL` points to production DB
- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` changed from defaults
- [ ] `DEEPSEEK_API_KEY` set (if AI features required)
- [ ] Database migrations applied (`npx prisma migrate deploy`)
- [ ] Redis accessible from backend container
- [ ] Health endpoint returns all-green
- [ ] Frontend can reach backend API
- [ ] Prometheus metrics visible at `/metrics`

## Monitoring
- **Health endpoint:** `GET /health` — JSON component status
- **Metrics:** `GET /metrics` — Prometheus format
- **Logs:** `docker compose logs -f --tail=100 backend`
- **Alerts:** Configure Prometheus + AlertManager for `sonic_*` metrics
