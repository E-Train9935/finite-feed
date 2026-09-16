$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example" -ForegroundColor Cyan
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "Node.js/npm is required. Install Node.js 20+ and rerun this script."
}

Write-Host "Installing workspace dependencies..." -ForegroundColor Magenta
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

Write-Host "Starting FINITE_FEED..." -ForegroundColor Cyan
Write-Host "Open http://localhost:5173" -ForegroundColor Green
npm run dev
