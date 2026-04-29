$kvUrl   = "https://lasting-trout-109714.upstash.io"
$kvToken = "gQAAAAAAAaySAAIgcDJlNTI4YmM1OGY5NGM0YTZlOTJkYTU3Y2Q4MDg3ZmIzNA"
$headers = @{ Authorization = "Bearer $kvToken" }

$r = Invoke-RestMethod -Uri "$kvUrl/get/$([Uri]::EscapeDataString('ca:access_token'))" -Method GET -Headers $headers
$token = $r.result
# Remover aspas se existirem
if ($token.StartsWith('"') -and $token.EndsWith('"')) {
  $token = $token.Substring(1, $token.Length - 2)
}
Write-Host "Token (inicio): $($token.Substring(0, 30))..."

$authHeaders = @{ Authorization = "Bearer $token" }
$caBase = "https://api-v2.contaazul.com/v1"

Write-Host "`n=== Financeiro: contas-a-receber/buscar ==="
try {
  $r = Invoke-WebRequest -Uri "$caBase/financeiro/eventos-financeiros/contas-a-receber/buscar?size=5" -Headers $authHeaders -ErrorAction Stop
  Write-Host "✅ Status $($r.StatusCode)"
  $j = $r.Content | ConvertFrom-Json
  Write-Host "Items: $($j.content.Count) | Total: $($j.totalElements)"
} catch {
  Write-Host "❌ $($_.Exception.Response.StatusCode.value__)"
}

Write-Host "`n=== Vendas: venda/busca ==="
try {
  $r = Invoke-WebRequest -Uri "$caBase/venda/busca?size=5" -Headers $authHeaders -ErrorAction Stop
  Write-Host "✅ Status $($r.StatusCode)"
  $j = $r.Content | ConvertFrom-Json
  Write-Host "Primeiro: $($j | ConvertTo-Json -Depth 1 | Select-Object -First 100)"
} catch {
  Write-Host "❌ $($_.Exception.Response.StatusCode.value__)"
}

Write-Host "`n=== Pessoas: pessoa/busca ==="
try {
  $r = Invoke-WebRequest -Uri "$caBase/pessoa/busca?size=5" -Headers $authHeaders -ErrorAction Stop
  Write-Host "✅ Status $($r.StatusCode)"
  $j = $r.Content | ConvertFrom-Json
  Write-Host "Content keys: $($j.PSObject.Properties.Name -join ', ')"
} catch {
  Write-Host "❌ $($_.Exception.Response.StatusCode.value__)"
}
