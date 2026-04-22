# Limpiar duplicados de Supabase
$apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemt5bHhncWNramZrY21mb3RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI0Nzc1NSwiZXhwIjoyMDg3ODIzNzU1fQ.IiksS0WwZZVlx9XJCzLhswJzSeeWnNS0dp3Z5uZiCSs"
$url = "https://wazkylxgqckjfkcmfotl.supabase.co/rest/v1/draws"

$headers = @{
    "apikey" = $apiKey
    "Authorization" = "Bearer $apiKey"
    "Content-Type" = "application/json"
}

# Get all unique date+turno combinations
$all = Invoke-RestMethod -Uri "$url?select=date,turno,numbers,id&order=date.desc,turno.desc" -Header $headers
Write-Host "Total records: $($all.Count)"

# Group and keep first
$grouped = $all | Group-Object -Property date,turno
$deleted = 0

foreach ($g in $grouped) {
    $items = $g.Group
    if ($items.Count -gt 1) {
        # Keep first, delete rest
        $toDelete = $items | Select-Object -Skip 1
        foreach ($d in $toDelete) {
            try {
                $delUrl = "$url?id=eq.$($d.id)"
                $r = Invoke-RestMethod -Uri $delUrl -Method DELETE -Header $headers -ErrorAction Stop
                $deleted++
            } catch {
                Write-Host "Error deleting $($d.id): $($_.Exception.Message)"
            }
        }
        Write-Host "Deleted $($toDelete.Count) duplicates for $($g.Name)"
    }
}

Write-Host "Total deleted: $deleted"