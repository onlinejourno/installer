#!/usr/bin/env bash
# OnlineJourno Installer launcher for macOS and Linux.
# Usage: ./start.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${INSTALLER_PORT:-7000}"
URL="http://127.0.0.1:${PORT}"

echo "OnlineJourno Installer"
echo "======================"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required but not found."
  echo "Install Node 18+ from https://nodejs.org/ and try again."
  exit 1
fi

NODE_VERSION="$(node --version | sed 's/v//')"
echo "Node.js ${NODE_VERSION}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is required but not found."
  echo "Install Docker from https://docs.docker.com/get-docker/ and try again."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1 && ! docker-compose --version >/dev/null 2>&1; then
  echo "Error: Docker Compose is required but not found."
  echo "Install Docker Desktop or the Docker Compose plugin."
  exit 1
fi

echo "Docker and Docker Compose found."
echo "Starting installer at ${URL}"

# Try to open the browser; never fail the script if it doesn't work.
open_browser() {
  if command -v open >/dev/null 2>&1; then
    open "${URL}"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${URL}"
  fi
}

# Open browser after a short delay so the server is ready.
(sleep 2 && open_browser) &

cd "${SCRIPT_DIR}"
exec node server.mjs
