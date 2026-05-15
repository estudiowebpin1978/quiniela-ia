# Repopulate script for Quiniela IA
# This script calls the deployed API to scrape historical data from the actual website
# and overwrite any remaining bad data in the database.

param(
    [int]$Days = 30,
    [string]$BaseUrl = "https://quiniela-ia-two.vercel.app",
    [string]$Secret = "quiniela_ia_cron_2024_seguro"
)

Write-Host "=== Repopulate Quiniela IA ===" -ForegroundColor Cyan
Write-Host "Scraping last $Days days of historical data..."
Write-Host ""

# Step 1: Scrape historical data via the individual page scraper
$url1 = "$BaseUrl/api/cron?secret=$Secret&history=true&days=$Days&force=true"
Write-Host "Calling: $url1" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $url1 -Method Get -TimeoutSec 120
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
