# -------------------  SIMPLE BACKFILL  -------------------
$DAYS_BACK = 30

Write-Host "=== Config ==="
Write-Host "DAYS: $DAYS_BACK"
Write-Host "================"

# Fetch HTML
$URL = "https://www.ruta1000.com.ar/index2008.php?Resultado=Quiniela_Nacional_Sorteos_Anteriores"
Write-Host "Fetching: $URL"

try {
    $response = Invoke-WebRequest -Uri $URL -UserAgent "Mozilla/5.0" -TimeoutSec 30 -UseBasicParsing
    $html = $response.Content
    
    # Find rows for 18/04/2026
    $sorteosFound = @{}
    
    # Simple regex approach - find each turno's numbers
    $turnos = @{
        "previa" = "10:15"
        "primera" = "12:00"
        "matutina" = "15:00"
        "vespertina" = "18:00"
        "nocturna" = "21:00"
    }
    
    foreach ($turno in $turnos.Keys) {
        $hora = $turnos[$turno]
        
        # Find the row with this fecha and hora
        if ($html -match "18/04/2026.*?$hora.*?(<tr[^>]*>.*?<td[^>]*>(\d{4})</td><td[^>]*>(\d{4})</td><td[^>]*>(\d{4})</td><td[^>]*>(\d{4})</td><td[^>]*>(\d{4})</td>)") {
            # Extract first 5 numbers - need complete pattern
        }
        
        # Alternative: find table cell with fecha and get following cells
        $pattern = "18/04/2026.*?$hora.*?<td[^>]*>(\d{4})</td>"
        $matches = [regex]::Matches($html, $pattern)
        
        if ($matches.Count -gt 0) {
            Write-Host "Found $turno at $hora"
        }
    }
    
    Write-Host ""
    Write-Host "Looking for specific patterns..."
    
    # Match pattern: <td>18/04/2026<br>21:00</td>
    if ($html -match '18/04/2026.*?21:00.*?(?:<td[^>]*>(\d{4})</td>){1,20}') {
        Write-Host "Matched NOCTURNA section"
    }
    
    # Simpler: extract all <td>1234</td> after the fecha+hora
    $section = [regex]::Match($html, '(?s)18/04/2026.*?21:00</td>.*?<tr[^>]*>.*?</tr>').Value
    if ($section) {
        $nums = [regex]::Matches($section, '<td[^>]*>(\d{4})</td>') | ForEach-Object { $_.Groups[1].Value }
        Write-Host "Nocturna nums: $($nums.Count) - $($nums[0..4] -join ', ')"
    }
    
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Fin."