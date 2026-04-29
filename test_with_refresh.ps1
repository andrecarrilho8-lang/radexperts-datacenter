$kvUrl     = "https://lasting-trout-109714.upstash.io"
$kvToken   = "gQAAAAAAAaySAAIgcDJlNTI4YmM1OGY5NGM0YTZlOTJkYTU3Y2Q4MDg3ZmIzNA"
$kvHeaders = @{ Authorization = "Bearer $kvToken"; "Content-Type" = "application/json" }
$basicAuth = "M2g4cmZqcnZ0YWU1NXNoMGVlY3BkZWdpa3Y6MnA5NzZsZ2MxNXA5dWVzcjJ1cjIxNGowdTE0NDJnZzJzY3VsOTE5MGE3aWFuN2RmMWR1"

# Pegar refresh_token
$r = Invoke-RestMethod -Uri "$kvUrl/get/$([Uri]::EscapeDataString('ca:refresh_token'))" -Method GET -Headers @{ Authorization = "Bearer $kvToken" }
$refreshToken = $r.result
if ($refreshToken.StartsWith('"') -and $refreshToken.EndsWith('"')) {
  $refreshToken = $refreshToken.Substring(1, $refreshToken.Length - 2)
}

# Renovar
$body = "grant_type=refresh_token&refresh_token=$([Uri]::EscapeDataString($refreshToken))"
$res = Invoke-RestMethod -Uri "https://auth.contaazul.com/oauth2/token" -Method POST -Headers @{ Authorization = "Basic $basicAuth"; "Content-Type" = "application/x-www-form-urlencoded" } -Body $body
$token = $res.access_token
Write-Host "Token renovado! Inicio: $($token.Substring(0, 30))..."

# Salvar sem aspas — body JSON string simples
$body1 = '"' + $res.access_token + '"'
$body2 = '"' + $res.refresh_token + '"'  
$body3 = '"' + ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + ($res.expires_in * 1000)).ToString() + '"'
Invoke-RestMethod -Uri "$kvUrl/set/$([Uri]::EscapeDataString('ca:access_token'))"  -Method POST -Headers $kvHeaders -Body $body1 | Out-Null
Invoke-RestMethod -Uri "$kvUrl/set/$([Uri]::EscapeDataString('ca:refresh_token'))" -Method POST -Headers $kvHeaders -Body $body2 | Out-Null
Invoke-RestMethod -Uri "$kvUrl/set/$([Uri]::EscapeDataString('ca:expires_at'))"    -Method POST -Headers $kvHeaders -Body $body3 | Out-Null

$authH = @{ Authorization = "Bearer $token" }
$caBase = "https://api-v2.contaazul.com/v1"

Write-Host "`n=== Financeiro contas-a-receber/buscar ==="
try {
  $r = Invoke-WebRequest -Uri "$caBase/financeiro/eventos-financeiros/contas-a-receber/buscar?size=3" -Headers $authH -ErrorAction Stop
  Write-Host "✅ $($r.StatusCode) | Sample: $($r.Content.Substring(0, 200))"
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  try { $b = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream()).ReadToEnd() } catch { $b = "" }
  Write-Host "❌ $sc : $b"
}

Write-Host "`n=== Vendas venda/busca ==="
try {
  $r = Invoke-WebRequest -Uri "$caBase/venda/busca?size=3" -Headers $authH -ErrorAction Stop
  Write-Host "✅ $($r.StatusCode) | Sample: $($r.Content.Substring(0, 200))"
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  try { $b = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream()).ReadToEnd() } catch { $b = "" }
  Write-Host "❌ $sc : $b"
}

Write-Host "`n=== Pessoas pessoa/busca ==="
try {
  $r = Invoke-WebRequest -Uri "$caBase/pessoa/busca?size=3" -Headers $authH -ErrorAction Stop
  Write-Host "✅ $($r.StatusCode) | Sample: $($r.Content.Substring(0, 200))"
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  try { $b = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream()).ReadToEnd() } catch { $b = "" }
  Write-Host "❌ $sc : $b"
}
