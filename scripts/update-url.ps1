# Script para reemplazar la URL antigua por la nueva en todo el proyecto
$root = "C:\Users\usuario\quiniela-ia"
$oldUrl = "https://quiniela-ia-two.vercel.app"
$newUrl = "https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev"

$excludedDirs = @("node_modules", ".next", ".ai", ".venv-py312", ".git")
$extensions = @("*.ts", "*.tsx", "*.js", "*.json", "*.md", "*.sql")

$files = Get-ChildItem -Path $root -Recurse -File -Include $extensions -ErrorAction SilentlyContinue | Where-Object {
    $rel = $_.FullName.Replace($root, "")
    $exclude = $false
    foreach ($dir in $excludedDirs) {
        if ($rel -match [regex]::Escape("\$dir\")) { $exclude = $true }
    }
    -not $exclude
}

Write-Host "Archivos a revisar: $($files.Count)"

$updated = 0
foreach ($file in $files) {
    try {
        $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($content -and $content.Contains($oldUrl)) {
            $newContent = $content.Replace($oldUrl, $newUrl)
            Set-Content -Path $file.FullName -Value $newContent -NoNewline
            Write-Host "ACT: $($file.FullName.Replace($root, ''))"
            $updated++
        }
    } catch { }
}
Write-Host "`nTOTAL ACTUALIZADOS: $updated"
