#!/bin/bash

# Engage - Quick Deploy to Render
# Usage: ./scripts/deploy.sh [backend|frontend|all]

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Service IDs (get these from Render dashboard URL or API)
BACKEND_SERVICE_ID="${RENDER_BACKEND_SERVICE_ID:-srv-ck8g9jlumphs73f5n9l0}"
FRONTEND_SERVICE_ID="${RENDER_FRONTEND_SERVICE_ID:-srv-ck8g9jlumphs73f5n9l1}"
API_KEY="${RENDER_API_KEY}"

if [ -z "$API_KEY" ]; then
    echo -e "${RED}Error: RENDER_API_KEY not set${NC}"
    echo "Get your API key from: https://dashboard.render.com/settings/api-keys"
    echo "Then run: export RENDER_API_KEY=your_key_here"
    exit 1
fi

deploy_service() {
    local service_id=$1
    local service_name=$2
    local clear_cache=$3
    
    echo -e "${BLUE}🚀 Deploying $service_name...${NC}"
    
    response=$(curl -s -X POST "https://api.render.com/v1/services/$service_id/deploys" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"clearCache\": $clear_cache}")
    
    if echo "$response" | grep -q "id"; then
        echo -e "${GREEN}✅ $service_name deploy triggered${NC}"
        deploy_id=$(echo "$response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        echo "   Deploy ID: $deploy_id"
        echo "   Monitor: https://dashboard.render.com/web/$service_id/events"
    else
        echo -e "${RED}❌ Failed to deploy $service_name${NC}"
        echo "   Response: $response"
        return 1
    fi
}

check_status() {
    local service_id=$1
    local service_name=$2
    
    echo -e "${BLUE}📊 Checking $service_name status...${NC}"
    
    response=$(curl -s "https://api.render.com/v1/services/$service_id" \
        -H "Authorization: Bearer $API_KEY")
    
    status=$(echo "$response" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    url=$(echo "$response" | grep -o '"url":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    echo -e "   Status: ${YELLOW}$status${NC}"
    echo -e "   URL: $url"
}

# Main
echo "========================================"
echo "   ENGAGE - RENDER DEPLOY"
echo "========================================"
echo ""

case "${1:-all}" in
    backend|b)
        deploy_service "$BACKEND_SERVICE_ID" "Backend" "false"
        ;;
    frontend|f)
        deploy_service "$FRONTEND_SERVICE_ID" "Frontend" "true"
        ;;
    status|s)
        check_status "$BACKEND_SERVICE_ID" "Backend"
        check_status "$FRONTEND_SERVICE_ID" "Frontend"
        ;;
    all|a|*)
        deploy_service "$BACKEND_SERVICE_ID" "Backend" "false"
        echo ""
        sleep 2
        deploy_service "$FRONTEND_SERVICE_ID" "Frontend" "true"
        echo ""
        echo -e "${GREEN}🎉 All deployments triggered!${NC}"
        echo ""
        echo "Monitor progress:"
        echo "  Backend:  https://dashboard.render.com/web/$BACKEND_SERVICE_ID/events"
        echo "  Frontend: https://dashboard.render.com/static/$FRONTEND_SERVICE_ID/events"
        ;;
esac

echo ""
