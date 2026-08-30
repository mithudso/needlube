#!/usr/bin/env bash
# Launcher for the official PayPal MCP server (@paypal/mcp).
# Mints a fresh OAuth2 access token from the client credentials in .paypalauth
# (sandbox app) on every MCP start, then execs the server.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
# .paypalauth uses Key="value" lines
Client_ID=$(grep '^Client_ID=' "$DIR/.paypalauth" | cut -d'"' -f2)
Secret_Key=$(grep '^Secret_Key=' "$DIR/.paypalauth" | cut -d'"' -f2)

TOKEN=$(curl -s https://api-m.sandbox.paypal.com/v1/oauth2/token \
  -u "$Client_ID:$Secret_Key" \
  -d grant_type=client_credentials | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

export PAYPAL_ACCESS_TOKEN="$TOKEN"
export PAYPAL_ENVIRONMENT="SANDBOX"
exec npx -y @paypal/mcp --tools=all
