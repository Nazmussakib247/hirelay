#!/bin/sh
# Auto-import HR credentials + workflows into n8n (runs in the n8n-import
# one-shot container defined in docker-compose.yml, then exits).
#
# - Credentials are rendered from environment variables (.env) with fixed IDs.
# - Workflows are imported from /workflows/*.json with fixed IDs and
#   "active": true, so re-running is idempotent and webhooks register as soon
#   as the main n8n container starts.
set -e

echo "==> [n8n-import] rendering credentials from environment"
node /workflows/scripts/render-credentials.js > /tmp/hr-credentials.json

echo "==> [n8n-import] importing credentials"
n8n import:credentials --input=/tmp/hr-credentials.json

echo "==> [n8n-import] importing workflows from /workflows"
n8n import:workflow --separate --input=/workflows

rm -f /tmp/hr-credentials.json
echo "==> [n8n-import] done"
