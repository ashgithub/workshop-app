#!/usr/bin/env bash
set -euo pipefail

if ! command -v uv >/dev/null 2>&1; then
    echo "uv is required to run migrations" >&2
    exit 1
fi

uv run python - <<'PY'
from backend.database import db
print("Rebuilding Oracle schema...")
if db.initialize_schema():
    print("Schema rebuild and seed completed.")
else:
    raise SystemExit("Schema rebuild failed.")
PY
