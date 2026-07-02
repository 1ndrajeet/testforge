#!/bin/bash
# update.sh - Update TestForge to latest version

echo "🔄 Updating TestForge..."

# Stop containers
docker compose down 2>/dev/null || docker-compose down 2>/dev/null

# Pull latest images
docker compose pull 2>/dev/null || docker-compose pull 2>/dev/null

# Start containers
docker compose up -d 2>/dev/null || docker-compose up -d 2>/dev/null

echo ""
echo "✅ TestForge updated successfully!"
echo "   🌐 Frontend: http://localhost:4937"
echo "   🔧 Backend:  http://localhost:4936"