$path = 'app/predictions/page.tsx'
$content = [System.IO.File]::ReadAllText($path)
# Detectar y corregir: línea con "          )}" que está FUERA del contexto de showCalc
# (aquí usamos regex para encontar patterns problemáticos)
# El problema es que "          )}" sin indentación de condición sigue siendo OK
# pero BUILD_ERROR apuntaba a 1344:12. Revisamos si hay ün paréntesis abierto sin cerrar.

$lines = [System.IO.File]::ReadAllLines($path)
Write-Host "Total lines: $($lines.Count)"
Write-Host "Line 1340-1348:"
for ($i = 1339; $i -le 1349; $i++) {
    if ($i -lt $lines.Count) { Write-Host ("  {0}: '{1}'" -f ($i+1), $lines[$i]) }
}
