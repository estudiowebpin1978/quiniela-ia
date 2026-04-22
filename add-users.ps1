# Premium users to add
$emails = @(
    "nataliabenitez885@gmail.com",
    "zarzakeylavalentina@gmail.com",
    "gpstoyota2024@gmail.com",
    "jonatanroza125@gmail.com",
    "roomill3108@gmail.com",
    "adrianebarros1989@gmail.com",
    "moreiradaniel676@gmail.com",
    "margaritarojas1984@gmail.com",
    "nazarenovega211@gmail.com",
    "roxana311@live.com",
    "estefabaldo351@gmail.com",
    "milagros.rueda.99@gmail.com",
    "hernandeaguirre1@gmail.com",
    "milagrosbenegas872@gmail.com",
    "tinchochichon41@gmail.com",
    "remisesrosarionorte@gmail.com",
    "georchina348@gmail.com",
    "deep666web@gmail.com"
)

$apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemt5bHhncWNramZrY21mb3RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI0Nzc1NSwiZXhwIjoyMDg3ODIzNzU1fQ.IiksS0WwZZVlx9XJCzLhswJzSeeWnNS0dp3Z5uZiCSs"
$url = "https://wazkylxgqckjfkcmfotl.supabase.co/rest/v1/user_profiles"

$headers = @{
    "apikey" = $apiKey
    "Authorization" = "Bearer $apiKey"
    "Content-Type" = "application/json"
    "Prefer" = "return=minimal"
}

foreach ($email in $emails) {
    $id = [guid]::NewGuid().ToString()
    $body = @{
        id = $id
        email = $email
        role = "premium"
        premium_until = "2099-12-31T23:59:59Z"
    } | ConvertTo-Json

    try {
        $r = Invoke-RestMethod -Uri $url -Method POST -Header $headers -Body $body -ErrorAction Stop
        Write-Host "OK: $email" -ForegroundColor Green
    } catch {
        Write-Host "Error: $email - $($_.Exception.Message)" -ForegroundColor Red
    }
}