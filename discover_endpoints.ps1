$kvUrl      = "https://lasting-trout-109714.upstash.io"
$kvToken    = "gQAAAAAAAaySAAIgcDJlNTI4YmM1OGY5NGM0YTZlOTJkYTU3Y2Q4MDg3ZmIzNA"
$headers    = @{ Authorization = "Bearer $kvToken" }

# Pegar o novo access_token
$r = Invoke-RestMethod -Uri "$kvUrl/get/$([Uri]::EscapeDataString('ca:access_token'))" -Method GET -Headers $headers
$token = $r.result

Write-Host "=== Testando endpoints da Conta Azul ==="
$endpoints = @(
  "/financeiro/eventos-financeiros?size=5",
  "/financeiro/contas-receber?size=5",
  "/financeiro/contas-pagar?size=5",
  "/financeiro/extrato?size=5",
  "/vendas?size=5",
  "/people?size=5",
  "/pessoas?size=5",
  "/clientes?size=5",
  "/sale?size=5",
  "/financial/events?size=5",
  "/contracts?size=5",
  "/contratos?size=5"
)

$caBase = "https://api-v2.contaazul.com/v1"
$authHeaders = @{ Authorization = "Bearer $token" }

foreach ($ep in $endpoints) {
  try {
    $res = Invoke-WebRequest -Uri "$caBase$ep" -Headers $authHeaders -ErrorAction Stop
    Write-Host "✅ $ep → $($res.StatusCode)"
    $json = $res.Content | ConvertFrom-Json
    Write-Host "   Keys: $($json.PSObject.Properties.Name -join ', ')"
  } catch {
    $sc = $_.Exception.Response.StatusCode.value__
    Write-Host "❌ $ep → $sc"
  }
}
