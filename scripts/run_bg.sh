#!/bin/zsh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")"/.. && pwd)"
cd "$PROJECT_ROOT"

LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/backend.log"

mkdir -p "$LOG_DIR"

if [ -f "$PROJECT_ROOT/.venv/bin/activate" ]; then
    source "$PROJECT_ROOT/.venv/bin/activate"
fi

CMD="uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"

echo "Starting backend with nohup..."
nohup $CMD > "$LOG_FILE" 2>&1 &
PID=$!

echo "Backend started in background (PID: $PID)"
echo "Logs: $LOG_FILE"