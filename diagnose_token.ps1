$kvUrl   = "https://lasting-trout-109714.upstash.io"
$kvToken = "gQAAAAAAAaySAAIgcDJlNTI4YmM1OGY5NGM0YTZlOTJkYTU3Y2Q4MDg3ZmIzNA"
$headers = @{ Authorization = "Bearer $kvToken" }

Write-Host "=== ca:access_token (primeiros 100 chars) ==="
$r = Invoke-RestMethod -Uri "$kvUrl/get/$([Uri]::EscapeDataString('ca:access_token'))" -Method GET -Headers $headers
$val = $r.result
Write-Host "Tipo: $($val.GetType().Name)"
Write-Host "Inicio: $($val.Substring(0, [Math]::Min(100, $val.Length)))"
Write-Host "Tem aspas? Começa com aspas: $($val.StartsWith('`"'))"

Write-Host "`n=== ca:expires_at ==="
$r2 = Invoke-RestMethod -Uri "$kvUrl/get/$([Uri]::EscapeDataString('ca:expires_at'))" -Method GET -Headers $headers
Write-Host "Value: $($r2.result)"

Write-Host "`n=== Teste GET financeiro direto com token ==="
# Pegar o token
$accessToken = $val
if ($accessToken.StartsWith('"') -and $accessToken.EndsWith('"')) {
  $accessToken = $accessToken.Substring(1, $accessToken.Length - 2)
  Write-Host "Token tinha aspas extras, removidas"
}
Write-Host "Token start: $($accessToken.Substring(0, 20))..."

try {
  $res = Invoke-RestMethod -Uri "https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros?size=5&page=0&tipo=RECEITA" -Headers @{ Authorization = "Bearer $accessToken" }
  Write-Host "Sucesso! Items: $($res.content.Count)"
} catch { Write-Host "ERRO na API CA: $_" }
