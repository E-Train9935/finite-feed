$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example" -ForegroundColor Cyan
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker Desktop is required for the Docker stack."
}

Write-Host "Building and starting FINITE_FEED + Ollama..." -ForegroundColor Magenta
docker compose up -d --build
Start-Sleep -Seconds 3
Write-Host "Pulling the default local model. This can take a while on the first run." -ForegroundColor Cyan
docker compose exec ollama ollama pull llama3.2:3b
Write-Host "FINITE_FEED is available at http://localhost:8080" -ForegroundColor Green
