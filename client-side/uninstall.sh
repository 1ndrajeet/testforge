#!/bin/bash
# uninstall.sh - Remove TestForge completely

echo "🗑️  Uninstalling TestForge..."

# Stop and remove containers
docker compose down -v 2>/dev/null || docker-compose down -v 2>/dev/null

# Remove images
docker rmi 1ndrajeet/testforge-backend:lightweight 2>/dev/null || true
docker rmi 1ndrajeet/testforge-frontend:lightweight 2>/dev/null || true

# Remove data
rm -rf data/

echo "✅ TestForge has been removed completely."
echo ""
echo "To reinstall, run: ./install.sh"