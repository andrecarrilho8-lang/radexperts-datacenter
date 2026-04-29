Write-Host "--- Checking Conta Azul status ---"
try {
  $r = Invoke-RestMethod -Uri 'https://datacenter.radexperts.com.br/api/conta-azul/status' -Method GET
  Write-Host "Status: $($r | ConvertTo-Json -Depth 5)"
} catch { Write-Host "Error: $_" }

Write-Host "`n--- Checking KV tokens directly ---"
$kvUrl   = "https://lasting-trout-109714.upstash.io"
$kvToken = "gQAAAAAAAaySAAIgcDJlNTI4YmM1OGY5NGM0YTZlOTJkYTU3Y2Q4MDg3ZmIzNA"
$headers = @{ Authorization = "Bearer $kvToken" }

$keys = @("ca:access_token", "ca:refresh_token", "ca:expires_at")
foreach ($key in $keys) {
  try {
    $r = Invoke-RestMethod -Uri "$kvUrl/get/$([Uri]::EscapeDataString($key))" -Method GET -Headers $headers
    $val = if ($r.result) { $r.result.Substring(0, [Math]::Min(50, $r.result.Length)) + "..." } else { "(null)" }
    Write-Host "$key = $val"
  } catch { Write-Host "$key = ERROR: $_" }
}
