#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

command -v npm >/dev/null 2>&1 || { echo "Node.js/npm 20+ is required." >&2; exit 1; }
npm install
echo "Starting FINITE_FEED at http://localhost:5173"
npm run dev
