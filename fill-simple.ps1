# -------------------  CONFIG  -------------------
$SECRET = "QUINIELA_IA_CRON_2024_SEGURO"
$BASE_URL = "https://quiniela-ia-two.vercel.app/api/cron-nacional"
$DAYS_BACK = 365
$DELAY_SEC = 1
# ------------------------------------------------

Write-Host "=== Config ==="
Write-Host "SECRET: $SECRET"
Write-Host "BASE_URL: $BASE_URL"
Write-Host "DAYS: $DAYS_BACK"
Write-Host "================"

for ($i = 0; $i -le $DAYS_BACK; $i++) {
    $date = (Get-Date).AddDays(-$i).ToString('yyyy-MM-dd')
    
    # Construir la URL manualmente para evitar problemas
    $uri = $BASE_URL + "?secret=" + $SECRET + "&date=" + $date
    
    $idx = $i + 1
    Write-Host "[$idx] $date" -NoNewline
    
    try {
        $response = Invoke-WebRequest -Uri $uri -Method GET -UserAgent "Mozilla/5.0" -TimeoutSec 15 -UseBasicParsing
        $content = $response.Content | ConvertFrom-Json
        
        if ($content.guardados) {
            Write-Host " -> guardados=$($content.guardados) turnos"
        } elseif ($content.ok) {
            Write-Host " -> ok=$($content.ok)"
        } elseif ($content.skip) {
            Write-Host " -> skip=true hora=$($content.hora)"
        } elseif ($content.error) {
            Write-Host " -> ERROR: $($content.error)"
        } else {
            Write-Host " -> $content"
        }
    } catch {
        Write-Host " -> ERROR: $($_.Exception.Message)"
    }
    
    Start-Sleep -Seconds $DELAY_SEC
}

Write-Host ""
Write-Host "Fin."