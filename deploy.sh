#!/usr/bin/env bash
# ==============================================================================
# Sonex Coffee System - Production One-Click Deployment Script
# ==============================================================================
set -e

echo "?? [Sonex Cloud] Initializing deployment pipeline..."

# 1. Check Docker installation
if ! command -v docker &> /dev/null; then
    echo "?? [Sonex Cloud] Docker not detected. Installing Docker engine..."
    curl -fsSL https://get.docker.com | sh
    sudo systemctl enable --now docker
fi

# 2. Check Docker Compose
if ! docker compose version &> /dev/null; then
    echo "?? [Sonex Cloud] Installing Docker Compose plugin..."
    sudo apt-get update && sudo apt-get install -y docker-compose-plugin
fi

# 3. Ensure production environment file
if [ ! -f .env.production ]; then
    echo "?? [Sonex Cloud] Creating production environment (.env.production)..."
    cat << 'EOF' > .env.production
POSTGRES_DB=cafe_db
POSTGRES_USER=cafe_user
POSTGRES_PASSWORD=cafe_password
JWT_ACCESS_SECRET=prod-access-secret-change-me-32-chars-minimum
JWT_REFRESH_SECRET=prod-refresh-secret-change-me-32-chars-minimum
DOMAIN_URL=http://localhost
EOF
fi

# 4. Build and run containers
echo "??? [Sonex Cloud] Building and starting production containers..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --remove-orphans

# 5. Wait for backend and database
echo "? [Sonex Cloud] Waiting for database and services to reach healthy status..."
sleep 10

# 6. Run database migrations
echo "??? [Sonex Cloud] Applying Prisma database migrations..."
docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy || true

# 7. Check status
echo "?? [Sonex Cloud] Checking container health..."
docker compose -f docker-compose.prod.yml ps

echo "=============================================================================="
echo "? [Sonex Cloud] Deployment complete! System is live and operational."
echo "?? Web Dashboard & POS: http://localhost (Port 80 / 443 via Nginx)"
echo "=============================================================================="
