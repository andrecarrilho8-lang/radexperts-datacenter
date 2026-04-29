$kvUrl   = "https://lasting-trout-109714.upstash.io"
$kvToken = "gQAAAAAAAaySAAIgcDJlNTI4YmM1OGY5NGM0YTZlOTJkYTU3Y2Q4MDg3ZmIzNA"
$headers = @{ Authorization = "Bearer $kvToken" }

# Pegar o access_token atual
$r = Invoke-RestMethod -Uri "$kvUrl/get/$([Uri]::EscapeDataString('ca:access_token'))" -Method GET -Headers $headers
$token = $r.result
Write-Host "Token (inicio): $($token.Substring(0, 40))..."
Write-Host "Token length: $($token.Length)"

# Testar diretamente
$authHeaders = @{ Authorization = "Bearer $token" }

Write-Host "`n=== Testando com token atual ==="
try {
  $res = Invoke-WebRequest -Uri "https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros?size=5&tipo=RECEITA" `
    -Headers $authHeaders -ErrorAction Stop
  Write-Host "✅ financeiro/eventos-financeiros → $($res.StatusCode)"
  Write-Host "Content sample: $($res.Content.Substring(0, [Math]::Min(200, $res.Content.Length)))"
} catch {
  $sc  = $_.Exception.Response.StatusCode.value__
  try {
    $body = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream()).ReadToEnd()
  } catch { $body = "(no body)" }
  Write-Host "❌ financeiro → $sc : $body"
}

Write-Host "`n=== Testando endpoint vendas/sale ==="
foreach ($ep in @("/vendas?size=3", "/sale?size=3", "/pessoas?size=3")) {
  try {
    $res = Invoke-WebRequest -Uri "https://api-v2.contaazul.com/v1$ep" -Headers $authHeaders -ErrorAction Stop
    Write-Host "✅ $ep → $($res.StatusCode) | $($res.Content.Substring(0, 80))..."
  } catch {
    $sc = $_.Exception.Response.StatusCode.value__
    Write-Host "❌ $ep → $sc"
  }
}
