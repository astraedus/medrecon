#!/bin/bash
# Start all MedRecon services locally for development.
#
# Usage: ./scripts/start-all.sh
# Stop:  ./scripts/start-all.sh stop

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

MCP_DIR="$PROJECT_DIR/mcp-server"
AGENT_DIR="$PROJECT_DIR/agent"
LOG_DIR="/tmp/medrecon-logs"

mkdir -p "$LOG_DIR"

stop_all() {
    echo "Stopping all MedRecon services..."
    for port in 5000 8001 8002 8003; do
        pid=$(lsof -ti:$port 2>/dev/null || true)
        if [ -n "$pid" ]; then
            kill $pid 2>/dev/null || true
            echo "  Stopped process on port $port (PID $pid)"
        fi
    done
    echo "All services stopped."
}

if [ "$1" = "stop" ]; then
    stop_all
    exit 0
fi

# Stop any existing services first
stop_all

echo ""
echo "Starting MedRecon services..."
echo ""

# 1. MCP Server (port 5000)
echo "[1/4] Starting MCP Server on port 5000..."
cd "$MCP_DIR"
node dist/index.js > "$LOG_DIR/mcp-server.log" 2>&1 &
echo "  PID: $! | Log: $LOG_DIR/mcp-server.log"

# 2. Source Collector (port 8001)
echo "[2/4] Starting Source Collector on port 8001..."
cd "$AGENT_DIR"
source venv/bin/activate
uvicorn source_collector.app:a2a_app --host 0.0.0.0 --port 8001 > "$LOG_DIR/source-collector.log" 2>&1 &
echo "  PID: $! | Log: $LOG_DIR/source-collector.log"

# 3. Interaction Checker (port 8002)
echo "[3/4] Starting Interaction Checker on port 8002..."
uvicorn interaction_checker.app:a2a_app --host 0.0.0.0 --port 8002 > "$LOG_DIR/interaction-checker.log" 2>&1 &
echo "  PID: $! | Log: $LOG_DIR/interaction-checker.log"

# 4. Orchestrator (port 8003)
echo "[4/4] Starting Orchestrator on port 8003..."
uvicorn orchestrator.app:a2a_app --host 0.0.0.0 --port 8003 > "$LOG_DIR/orchestrator.log" 2>&1 &
echo "  PID: $! | Log: $LOG_DIR/orchestrator.log"

echo ""
echo "Waiting for services to start..."
sleep 3

# Health checks
echo ""
echo "Service Status:"
for port_name in "5000:MCP Server" "8001:Source Collector" "8002:Interaction Checker" "8003:Orchestrator"; do
    port="${port_name%%:*}"
    name="${port_name##*:}"
    if curl -s "http://localhost:$port/" > /dev/null 2>&1 || curl -s "http://localhost:$port/health" > /dev/null 2>&1; then
        echo "  $name (port $port): UP"
    else
        echo "  $name (port $port): DOWN (check $LOG_DIR/*.log)"
    fi
done

echo ""
echo "Agent Cards:"
echo "  Source Collector:    http://localhost:8001/.well-known/agent-card.json"
echo "  Interaction Checker: http://localhost:8002/.well-known/agent-card.json"
echo "  Orchestrator:        http://localhost:8003/.well-known/agent-card.json"
echo ""
echo "To test: python3 scripts/test-orchestrator.py"
echo "To stop: ./scripts/start-all.sh stop"
