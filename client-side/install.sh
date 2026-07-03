#!/bin/bash
set -e

# ============================================================
# TestForge Installer v1.0.0
# ============================================================

echo ""
echo "============================================================"
echo "          TESTFORGE INSTALLER"
echo "          Version 1.0.0"
echo "          Lifetime Local Edition"
echo "============================================================"
echo ""

# ─── DOCKER CHECK ─────────────────────────────────────────────

if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed!"
    echo ""
    echo "Please install Docker Desktop from:"
    echo "  https://www.docker.com/products/docker-desktop/"
    echo ""
    echo "After installation, run this script again."
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "[ERROR] Docker is not running!"
    echo ""
    echo "Please start Docker Desktop and try again."
    exit 1
fi

echo "[OK] Docker is installed and running"
echo ""

# ─── COMPOSE CHECK ────────────────────────────────────────────

if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo "[ERROR] Docker Compose is not installed!"
    exit 1
fi

echo "[OK] Using: $COMPOSE_CMD"
echo ""

# ─── DATA DIRECTORIES ─────────────────────────────────────────

echo "Creating data directories..."
mkdir -p data/postgres data/uploads
echo ""

# ─── PULL IMAGES ──────────────────────────────────────────────

echo "Checking for image updates..."

if ! $COMPOSE_CMD pull; then
    echo ""
    echo "[INFO] Unable to pull newer images."
    echo "[INFO] Continuing with locally cached images."
fi

echo ""

# ─── START POSTGRES ───────────────────────────────────────────

echo "Starting PostgreSQL..."
$COMPOSE_CMD up -d --no-deps postgres

echo ""
echo "Waiting for PostgreSQL to be ready..."

# ─── POLL PG_ISREADY ──────────────────────────────────────────

MAX_ATTEMPTS=30
ATTEMPT=0

while ! $COMPOSE_CMD exec postgres pg_isready -U testforge &> /dev/null; do
    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
        echo "[ERROR] PostgreSQL did not become ready in time."
        exit 1
    fi
    echo "Waiting for PostgreSQL... (attempt $ATTEMPT of $MAX_ATTEMPTS)"
    sleep 2
done

echo "[OK] PostgreSQL is ready!"
echo ""

# ─── RUN MIGRATION ────────────────────────────────────────────

echo ""
echo "============================================================"
echo "          RUNNING DATABASE MIGRATION"
echo "============================================================"
echo ""

$COMPOSE_CMD run --rm migrate

if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] Database migration failed!"
    echo "Please check the logs above and try again."
    exit 1
fi

echo ""
echo "[OK] Database migration successful!"
echo ""

# ─── START SERVICES ───────────────────────────────────────────

echo "Starting TestForge services..."
$COMPOSE_CMD up -d --no-deps backend frontend

echo ""
echo "Waiting for services to be ready..."
sleep 5

# ─── VERIFY ────────────────────────────────────────────────────

echo ""
echo "============================================================"
echo "              INSTALLATION COMPLETE"
echo "============================================================"
echo ""
echo "  TestForge v1.0.0 is now running!"
echo ""
echo "  Frontend:  http://localhost:4937"
echo "  Backend:   http://localhost:4936"
echo "  Database:  localhost:4935"
echo ""
echo "  Logs:      $COMPOSE_CMD logs -f"
echo "  Stop:      $COMPOSE_CMD down"
echo "  Restart:   $COMPOSE_CMD restart"
echo ""
echo "============================================================"
echo ""