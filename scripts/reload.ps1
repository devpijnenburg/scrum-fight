param(
  [switch]$NoBuild,
  [switch]$NoOpen,
  [string]$Url
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Get-EnvValue([string]$Name) {
  $envPath = Join-Path $repoRoot '.env'
  if (-not (Test-Path $envPath)) { return $null }

  $line = Get-Content $envPath | Where-Object { $_ -match "^\s*$Name\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }

  return ($line -replace "^\s*$Name\s*=\s*", '').Trim().Trim('"').Trim("'")
}

if (-not $Url) {
  $baseUrl = Get-EnvValue 'BASE_URL'
  $port = Get-EnvValue 'PORT'

  if ($baseUrl) {
    $Url = $baseUrl
  } elseif ($port -and $port -ne '80') {
    $Url = "http://localhost:$port"
  } else {
    $Url = 'http://localhost'
  }
}

Write-Host 'Reloading Scrum Fight...' -ForegroundColor Cyan
Write-Host 'Database data is preserved. This script never removes Docker volumes.' -ForegroundColor DarkCyan

if ($NoBuild) {
  docker compose up -d
} else {
  docker compose up -d --build
}

if (-not $NoOpen) {
  Write-Host "Opening $Url" -ForegroundColor Cyan
  Start-Process $Url
}

Write-Host 'Scrum Fight is reloaded.' -ForegroundColor Green
