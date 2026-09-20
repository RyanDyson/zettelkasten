# One-command setup for Zettelkasten on Windows.
# Run:      powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
# Optional: -SkipOllama (you already installed the models)
param(
    [switch]$SkipOllama
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Info($message)  { Write-Host "==> $message" -ForegroundColor Cyan }
function Warn($message)  { Write-Host "!   $message" -ForegroundColor Yellow }
function Fail($message)  { Write-Host "X   $message" -ForegroundColor Red; Read-Host "Press Enter to close"; exit 1 }
function Pass($message)  { Write-Host "OK  $message" -ForegroundColor Green }

Info "Checking prerequisites..."

# --- Bun (frontend) -----------------------------------------------------------
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Info "Installing Bun (the frontend's package manager)..."
    try { irm bun.sh/install.ps1 | iex }
    catch { Fail "Could not install Bun automatically. Install it from https://bun.sh and run this script again." }
    $env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        Warn "Bun was installed but is not on PATH in this window. Open a NEW terminal and run the script again."
        Fail "Bun not detected."
    }
}
Pass "Bun found: $(bun --version)"

# --- Docker + containers ------------------------------------------------------
$dockerRunning = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { $dockerRunning = $true }
}
if (-not $dockerRunning) {
    $desktop = Get-Command "Docker Desktop" -ErrorAction SilentlyContinue
    $exe = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $exe) {
        Info "Starting Docker Desktop (first start can take a minute)..."
        Start-Process $exe
        for ($i = 0; $i -lt 24; $i++) {
            Start-Sleep 5
            docker info *> $null
            if ($LASTEXITCODE -eq 0) { $dockerRunning = $true; break }
        }
    }
}
if (Get-Command docker -ErrorAction SilentlyContinue) { docker info *> $null; if ($LASTEXITCODE -eq 0) { $dockerRunning = $true } }
if (-not $dockerRunning) {
    Fail "Docker is not running. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ , start it, then run this script again."
}
Pass "Docker is running."

# --- Environment --------------------------------------------------------------
if (-not (Test-Path "$root\.env")) {
    Copy-Item "$root\.env.example" "$root\.env"
    Pass "Created .env from .env.example."
}
Pass "Using .env (edit it later to change ports or models)."

# --- Ollama + local models ----------------------------------------------------
if (-not $SkipOllama) {
    function Find-Ollama {
        $cmd = Get-Command ollama -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
        foreach ($path in @("$env:LOCALAPPDATA\Programs\Ollama\ollama.exe", "$env:ProgramFiles\Ollama\ollama.exe")) {
            if (Test-Path $path) { return $path }
        }
        return $null
    }
    $ollama = Find-Ollama
    if (-not $ollama) {
        Info "Ollama is not installed. Trying winget, then a direct download..."
        try {
            winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements *> $null
        } catch {}
        $ollama = Find-Ollama
        $env:Path = "$env:LOCALAPPDATA\Programs\Ollama;$env:Path"
        if (-not $ollama) {
            try {
                Invoke-WebRequest "https://ollama.com/download/OllamaSetup.exe" -OutFile "$env:TEMP\OllamaSetup.exe"
                Start-Process "$env:TEMP\OllamaSetup.exe" -Wait
                $ollama = Find-Ollama
            } catch { Warn "Could not install Ollama automatically. Install it from https://ollama.com and run this script again." }
        }
        if (-not $ollama) { Warn "Ollama is not available; the app still runs, but AI features will wait for it." }
    }
    if ($ollama) {
        $up = $false
        try { $r = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { $up = $true } } catch {}
        if (-not $up) {
            Info "Starting Ollama in the background..."
            Start-Process $ollama -ArgumentList "serve" -WindowStyle Hidden
            for ($i = 0; $i -lt 12; $i++) {
                Start-Sleep 5
                try { $r = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { $up = $true; break } } catch {}
            }
        }
        if (-not $up) {
            Warn "Ollama did not answer on port 11434. Start the Ollama app later; AI features activate when it runs."
        } else {
            Pass "Ollama is running."
            Info "Downloading local models (a few GB, one time)..."
            & $ollama pull qwen2.5:7b | Out-Null
            & $ollama pull nomic-embed-text | Out-Null
            Pass "Local models ready."
        }
    }
}

# --- Backend + database -------------------------------------------------------
Info "Building and starting the backend and database (this can take several minutes the first time)..."
docker compose up -d --build | Out-Null

Info "Waiting for the API health check..."
$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { Start-Sleep 5 }
}
if (-not $healthy) {
    docker compose logs api | Select-Object -Last 40
    Fail "The API did not come up. See the logs above."
}
Pass "Backend is healthy at http://localhost:8000"

# --- Frontend -----------------------------------------------------------------
Set-Location "$root\frontend"
Info "Installing the frontend dependencies..."
bun install | Out-Null
Pass "Frontend dependencies installed."

Info "Starting the UI on http://localhost:3000 ..."
Start-Process bun -ArgumentList "run","dev","--hostname","127.0.0.1" -WorkingDirectory "$root\frontend" -WindowStyle Minimized

for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep 2
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { break }
    } catch {}
}
Start-Process "http://localhost:3000"

Pass "All done - the app is open in your browser."
Write-Host ""
Write-Host "Keep this terminal open? No need - all services keep running:"  -ForegroundColor Green
Write-Host "  * Docker:  backend + database       (re-runs automatically on restart)"
Write-Host "  * Ollama:   localhost:11434            (start the app yourself if stopped)"
Write-Host "  * UI:       the Bun window; close it to stop the app"
Write-Host "Open http://localhost:3000 again any time. Tip: click 'Run product demo' in the sidebar for a tour." -ForegroundColor Green
Read-Host "Press Enter to close this window"
