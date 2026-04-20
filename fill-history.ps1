# -------------------  CONFIG  -------------------
$SECRET   = "QUINIELA_IA_CRON_2024_SEGURO"   # <-- tu CRON_SECRET
$BASE_URL = "https://quiniela-ia-two.vercel.app/api/cron-nacional"
$DAYS_BACK = 730          # 2 años (usa 365 para 1 año)
$DELAY_SEC = 1            # pausa entre requests
# ------------------------------------------------

$SECRET   = $SECRET.Trim()
$BASE_URL = $BASE_URL.Trim()
if (-not ($BASE_URL -match '^https?://')) {
    throw "BASE_URL debe empezar con http:// o https://"
}

function Build-Query([hashtable]$p) {
    $pairs = $p.GetEnumerator() | ForEach-Object {
        "$($_.Key)=" + [System.Uri]::EscapeDataString($($_.Value))
    }
    return $pairs -join '&'
}

Write-Host "=== Iniciando carga de $DAYS_BACK días ==="
for ($i = 0; $i -le $DAYS_BACK; $i++) {
    $date = (Get-Date).AddDays(-$i).ToString('yyyy-MM-dd')
    $query = Build-Query @{ secret = $SECRET; date = $date }
    $uri   = "$BASE_URL?$query"

    Write-Host ("[{0:D3}] {1}  →  {2}" -f ($i+1), $date, $uri) -NoNewline

    try {
        $resp = Invoke-RestMethod -Uri $uri -Method Get `
                -Headers @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } `
                -TimeoutSec 15 -ErrorAction Stop

        if ($resp) {
            if ($resp.PSObject.Properties.Name -contains 'guardados') {
                $msg = "guardados=$($resp.guardados) turnos"
            } elseif ($resp.PSObject.Properties.Name -contains 'ok') {
                $msg = "ok=$($resp.ok)"
            } else {
                $msg = $resp.ToString()
            }
            Write-Host " → $msg"
        } else {
            Write-Host " → (vacío)"
        }
    } catch {
        Write-Host " → ERROR: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds $DELAY_SEC
}
Write-Host ""
Write-Host "✅  Carga finalizada."