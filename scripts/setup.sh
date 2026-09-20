#!/usr/bin/env bash
# One-command setup for Zettelkasten on macOS/Linux:
#   bash scripts/setup.sh
#   SKIP_OLLAMA=1 bash scripts/setup.sh   (models already installed)
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

info()  { echo "==> $1"; }
warn()  { echo "!   $1"; }
fail()  { echo "X   $1"; exit 1; }
pass()  { echo "OK  $1"; }

info "Checking prerequisites..."

# --- Bun (frontend) ----------------------------------------------------------
if ! command -v bun >/dev/null 2>&1; then
  info "Installing Bun (the frontend's package manager)..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  command -v bun >/dev/null 2>&1 || fail "Bun was installed but is not on PATH. Open a new terminal and run again."
fi
pass "Bun found: $(bun --version)"

# --- Docker ------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  fail "Docker is not installed. Get Docker Desktop (mac) or Docker Engine (linux): https://docs.docker.com/get-docker/ , then run this script again."
fi
docker info >/dev/null 2>&1 && ok=1 || ok=0
# mac: try starting Docker Desktop.
if [ "$ok" -eq 0 ] && [ "$(uname)" = "Darwin" ] && [ -x "/Applications/Docker.app/Contents/MacOS/Docker Desktop" ]; then
  info "Starting Docker Desktop (first start can take a minute)..."
  open -a "Docker Desktop" || true
  for _ in $(seq 1 24); do
    sleep 5
    docker info >/dev/null 2>&1 && { ok=1; break; }
  done
fi
sudo service docker start 2>/dev/null || sudo systemctl start docker 2>/dev/null || true
docker info >/dev/null 2>&1 && ok=1 || ok=0
[ "$ok" -eq 1 ] || fail "Docker is not running. Start Docker, then run this script again."
pass "Docker is running."

# --- Environment -------------------------------------------------------------
[ -f .env ] || { cp .env.example .env; pass "Created .env from .env.example."; }
pass "Using .env (edit it later to change ports or models)."

# --- Ollama + local models ---------------------------------------------------
if [ -z "$SKIP_OLLAMA" ]; then
  if ! command -v ollama >/dev/null 2>&1; then
    info "Ollama is not installed. Trying curl, then brew..."
    curl -fsSL https://ollama.com/install.sh | sh || brew install ollama || true
  fi
  if ! command -v ollama >/dev/null 2>&1; then
    warn "Ollama is missing; the app still runs, but AI features will wait for it."
  else
    if ! curl -sf http://localhost:11434/api/tags >/dev/null; then
      info "Starting Ollama in the background..."
      (nohup ollama serve >/dev/null 2>&1 &)
      for _ in $(seq 1 12); do sleep 3; curl -sf http://localhost:11434/api/tags >/dev/null && break; done
    fi
    if ! curl -sf http://localhost:11434/api/tags >/dev/null; then
      warn "Ollama did not answer on port 11434. Start the Ollama app later; AI features activate when it runs."
    else
      pass "Ollama is running."
      info "Downloading local models (a few GB, one time)..."
      ollama pull qwen2.5:7b
      ollama pull nomic-embed-text
      pass "Local models ready."
    fi
  fi
fi

# --- Backend + database ------------------------------------------------------
info "Building and starting the backend and database (several minutes the first time)..."
docker compose up -d --build

info "Waiting for the API health check..."
healthy=0
for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/health || true)"
  [ "$code" = "200" ] && { healthy=1; break; }
  sleep 5
done
[ "$healthy" -eq 1 ] || { docker compose logs api | tail -40; fail "The API did not come up. See the logs above."; }
pass "Backend is healthy at http://localhost:8000"

# --- Frontend ----------------------------------------------------------------
cd frontend
info "Installing the frontend dependencies..."
bun install
pass "Frontend dependencies installed."

info "Starting the UI on http://localhost:3000 ..."
(nohup bun run dev --hostname 127.0.0.1 >/tmp/zettelkasten-ui.log 2>&1 &)

for _ in $(seq 1 45); do
  code="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 || true)"
  [ "$code" = "200" ] && break
  sleep 2
done
URL="http://localhost:3000"
("$(command -v open || command -v xdg-open || echo echo)" "$URL") >/dev/null 2>&1 || true

pass "All done - the app is open in your browser."
echo
echo "Backend keeps running in Docker. The UI runs in the background:"
echo "  * logs:   tail -f /tmp/zettelkasten-ui.log"
echo "  * stop:   kill \$(pgrep -f \"bun run dev\")"
echo "Open http://localhost:3000 any time. Tip: click 'Run product demo' in the sidebar for a tour."
