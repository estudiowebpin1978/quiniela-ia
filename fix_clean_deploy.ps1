# Clean + Deploy script that works on Windows PowerShell 5.1
$repo = 'C:\Users\usuario\quiniela-ia'
Set-Location $repo

# Step 1: git clean (remove untracked files)
Write-Host "=== git clean ==="
git clean -fdxn 2>&1 | Select-Object -First 10

# Step 2: git commit
Write-Host "=== git commit ==="
git add -A 2>&1 | Out-Null
git commit -m "Auto-deploy: Poceada Ciudad, boton guardados" 2>&1 | Select-String "\[main"

# Step 3: vercel deploy with clean cache
Write-Host "=== vercel deploy ==="
$output = vercel deploy --prod --yes 2>&1
$output
if ($LASTEXITCODE -eq 0) { Write-Host "DEPLOY OK" } else { Write-Host "DEPLOY FAILED ($LASTEXITCODE)" }
