$kvUrl      = "https://lasting-trout-109714.upstash.io"
$kvToken    = "gQAAAAAAAaySAAIgcDJlNTI4YmM1OGY5NGM0YTZlOTJkYTU3Y2Q4MDg3ZmIzNA"
$headers    = @{ Authorization = "Bearer $kvToken" }
$basicAuth  = "M2g4cmZqcnZ0YWU1NXNoMGVlY3BkZWdpa3Y6MnA5NzZsZ2MxNXA5dWVzcjJ1cjIxNGowdTE0NDJnZzJzY3VsOTE5MGE3aWFuN2RmMWR1"

Write-Host "=== Buscando refresh_token do KV ==="
$r = Invoke-RestMethod -Uri "$kvUrl/get/$([Uri]::EscapeDataString('ca:refresh_token'))" -Method GET -Headers $headers
$refreshToken = $r.result
Write-Host "refresh_token inicio: $($refreshToken.Substring(0, [Math]::Min(50, $refreshToken.Length)))..."

Write-Host "`n=== Renovando access_token via refresh_token ==="
$body = "grant_type=refresh_token&refresh_token=$([Uri]::EscapeDataString($refreshToken))"
try {
  $res = Invoke-RestMethod -Uri "https://auth.contaazul.com/oauth2/token" `
    -Method POST `
    -Headers @{ Authorization = "Basic $basicAuth"; "Content-Type" = "application/x-www-form-urlencoded" } `
    -Body $body
  
  Write-Host "SUCESSO! Novo access_token inicio: $($res.access_token.Substring(0, 30))..."
  Write-Host "expires_in: $($res.expires_in)"
  
  $newExpiresAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + ($res.expires_in * 1000)
  
  Write-Host "`n=== Salvando novos tokens no KV ==="
  
  # Salvar access_token
  $r1 = Invoke-RestMethod -Uri "$kvUrl/set/$([Uri]::EscapeDataString('ca:access_token'))" `
    -Method POST -Headers ($headers + @{"Content-Type" = "application/json"}) `
    -Body ($res.access_token | ConvertTo-Json)
  Write-Host "access_token: $($r1.result)"
  
  # Salvar refresh_token (MUDA A CADA RENOVAÇÃO!)
  $r2 = Invoke-RestMethod -Uri "$kvUrl/set/$([Uri]::EscapeDataString('ca:refresh_token'))" `
    -Method POST -Headers ($headers + @{"Content-Type" = "application/json"}) `
    -Body ($res.refresh_token | ConvertTo-Json)
  Write-Host "refresh_token: $($r2.result)"
  
  # Salvar expires_at
  $r3 = Invoke-RestMethod -Uri "$kvUrl/set/$([Uri]::EscapeDataString('ca:expires_at'))" `
    -Method POST -Headers ($headers + @{"Content-Type" = "application/json"}) `
    -Body ($newExpiresAt.ToString() | ConvertTo-Json)
  Write-Host "expires_at: $($r3.result)"
  
  Write-Host "`n=== Verificando API financeiro com novo token ==="
  $newToken = $res.access_token
  try {
    $fr = Invoke-RestMethod -Uri "https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros?size=5&page=0&tipo=RECEITA" `
      -Headers @{ Authorization = "Bearer $newToken" }
    Write-Host "FINANCEIRO OK! Items: $($fr.content.Count)"
  } catch { Write-Host "ERRO financeiro: $_" }
  
} catch {
  Write-Host "ERRO refresh: $_"
  Write-Host "Detalhes: $($_.Exception.Response.StatusCode)"
}
