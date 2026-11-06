$path = 'app/predictions/page.tsx'
$bytes = [System.IO.File]::ReadAllBytes($path)
# Encontrar přými रस्ट-LF seek al stesso. Grabamosamos todo let's examine bytes around line 1340
# line 1340: "              <div style={{ fontSize:..." (8 spaces)
# line 1343: "            {showCalc && (" (12 spaces)
# Show exact characters 1343 and its neighbors
$lines = [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)
Write-Host "Line 1340:"; Write-Host $lines[1339]
Write-Host "Line 1343:"; Write-Host $lines[1342]
Write-Host "Line 1344:"; Write-Host $lines[1343]
Write-Host "Line 1350:"; Write-Host $lines[1349]
# Seek to check for CR only (backslash LF vs CRLF)
$txt = [System.IO.File]::ReadAllText($path)
# Find byte offset of line 1343 in raw text
$pattern = "            {showCalc && ("
if ($txt.Contains($pattern)) {
    $idx = $txt.IndexOf($pattern) + $pattern.Length - 1
    Write-Host ("Byte offset of pattern end: {0}" -f $idx)
    Write-Host ("Next 20 bytes: {0}" -f ($txt[$idx..($idx+19)]))
} else {
    Write-Host "Pattern NOT found as plain text"
    # Try searching with different whitespace
    $idx2 = $txt.IndexOf("showCalc")
    Write-Host ("First showCalc at byte: {0}" -f $idx2)
    if ($idx2 -ge 0) {
        $chunk = $txt.Substring($idx2, 80)
        Write-Host ("Chunk around showCalc: [{0}]" -f $chunk)
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($chunk)
        Write-Host ("Raw bytes: {0}" -f ($bytes | ForEach-Object { [char]$_ }))
    }
}
