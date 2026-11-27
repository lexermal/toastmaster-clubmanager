#!/bin/bash
# Web app and worker share one container and one SQLite file in $DATA_DIR.
set -e
xvfb-run -a --server-args="-screen 0 1280x800x24" node --import tsx src/worker/index.ts &
WORKER=$!
pnpm start -p "${PORT:-3000}" &
WEB=$!
# If either process dies, stop the container so the orchestrator restarts both.
wait -n $WORKER $WEB 2>/dev/null || true
kill $WORKER $WEB 2>/dev/null || true
exit 1
