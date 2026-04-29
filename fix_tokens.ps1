$kvUrl     = "https://lasting-trout-109714.upstash.io"
$kvToken   = "gQAAAAAAAaySAAIgcDJlNTI4YmM1OGY5NGM0YTZlOTJkYTU3Y2Q4MDg3ZmIzNA"
$kvHeaders = @{ Authorization = "Bearer $kvToken"; "Content-Type" = "application/json" }
$basicAuth = "M2g4cmZqcnZ0YWU1NXNoMGVlY3BkZWdpa3Y6MnA5NzZsZ2MxNXA5dWVzcjJ1cjIxNGowdTE0NDJnZzJzY3VsOTE5MGE3aWFuN2RmMWR1"

Write-Host "=== Renovando tokens via Conta Azul ==="

# Ler refresh_token (pode ter aspas extras do ConvertTo-Json anterior)
$r = Invoke-RestMethod -Uri "$kvUrl/get/$([Uri]::EscapeDataString('ca:refresh_token'))" -Method GET -Headers @{ Authorization = "Bearer $kvToken" }
$refreshToken = $r.result
# Remover aspas extras se existirem
if ($refreshToken.StartsWith('"') -and $refreshToken.EndsWith('"')) {
  $refreshToken = $refreshToken.Substring(1, $refreshToken.Length - 2)
  Write-Host "refresh_token tinha aspas, removidas"
}
Write-Host "refresh_token inicio: $($refreshToken.Substring(0, 30))..."

# Renovar
$body = "grant_type=refresh_token&refresh_token=$([Uri]::EscapeDataString($refreshToken))"
$res = Invoke-RestMethod -Uri "https://auth.contaazul.com/oauth2/token" `
  -Method POST `
  -Headers @{ Authorization = "Basic $basicAuth"; "Content-Type" = "application/x-www-form-urlencoded" } `
  -Body $body

Write-Host "Novo access_token inicio: $($res.access_token.Substring(0, 30))..."

# Salvar SEM aspas extras — o body deve ser "\"token\"" (JSON string)
# Mas o kvGet retorna o resultado sem parse, então a string JSON "eyJ..." = string bruta eyJ...
# Upstash REST: body = JSON string "valor" → retorna result = "valor" (sem aspas)

$newExpiresAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + ($res.expires_in * 1000)

# Salvar como string JSON pura
$body1 = '"' + $res.access_token + '"'
$body2 = '"' + $res.refresh_token + '"'  
$body3 = '"' + $newExpiresAt.ToString() + '"'

Write-Host "`n=== Salvando tokens (sem aspas extras) ==="
$r1 = Invoke-RestMethod -Uri "$kvUrl/set/$([Uri]::EscapeDataString('ca:access_token'))"  -Method POST -Headers $kvHeaders -Body $body1
$r2 = Invoke-RestMethod -Uri "$kvUrl/set/$([Uri]::EscapeDataString('ca:refresh_token'))" -Method POST -Headers $kvHeaders -Body $body2
$r3 = Invoke-RestMethod -Uri "$kvUrl/set/$([Uri]::EscapeDataString('ca:expires_at'))"    -Method POST -Headers $kvHeaders -Body $body3
Write-Host "access_token: $($r1.result) | refresh_token: $($r2.result) | expires_at: $($r3.result)"

# Verificar o que foi salvo
$check = Invoke-RestMethod -Uri "$kvUrl/get/$([Uri]::EscapeDataString('ca:access_token'))" -Method GET -Headers @{ Authorization = "Bearer $kvToken" }
$savedToken = $check.result
Write-Host "`nToken salvo (inicio): $($savedToken.Substring(0, 40))..."
Write-Host "Tem aspas? $($savedToken.StartsWith('`"'))"

Write-Host "`n=== Testando com token limpo ==="
$authHeaders = @{ Authorization = "Bearer $savedToken" }
try {
  $fr = Invoke-WebRequest -Uri "https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros?size=3&tipo=RECEITA" -Headers $authHeaders -ErrorAction Stop
  Write-Host "✅ Financeiro OK! Status $($fr.StatusCode)"
  Write-Host "Sample: $($fr.Content.Substring(0, 150))"
} catch {
  $sc  = $_.Exception.Response.StatusCode.value__
  try { $body = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream()).ReadToEnd() } catch { $body = "(no body)" }
  Write-Host "❌ $sc : $body"
}
