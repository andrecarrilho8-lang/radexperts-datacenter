$kvUrl   = "https://lasting-trout-109714.upstash.io"
$kvToken = "gQAAAAAAAaySAAIgcDJlNTI4YmM1OGY5NGM0YTZlOTJkYTU3Y2Q4MDg3ZmIzNA"
$headers = @{ Authorization = "Bearer $kvToken" }

$r = Invoke-RestMethod -Uri "$kvUrl/get/$([Uri]::EscapeDataString('ca:access_token'))" -Method GET -Headers $headers
$token = $r.result
if ($token.StartsWith('"') -and $token.EndsWith('"')) { $token = $token.Substring(1, $token.Length - 2) }

$authH  = @{ Authorization = "Bearer $token" }
$caBase = "https://api-v2.contaazul.com/v1"

Write-Host "=== 1. Contas financeiras (sem filtro de data) ==="
try {
  $r = Invoke-WebRequest -Uri "$caBase/conta-financeira?size=10" -Headers $authH -ErrorAction Stop
  Write-Host "✅ $($r.StatusCode)"
  $j = $r.Content | ConvertFrom-Json
  Write-Host "Contas encontradas: $($j.content.Count)"
  $j.content | ForEach-Object { Write-Host "  - $($_.nome) | Saldo: $($_.saldo)" }
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  try { $b = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream()).ReadToEnd() } catch { $b = "" }
  Write-Host "❌ $sc : $b"
}

Write-Host "`n=== 2. Receitas com período maior (últimos 36 meses) ==="
$de  = (Get-Date).AddMonths(-36).ToString("yyyy-MM-dd")
$ate = (Get-Date).AddMonths(6).ToString("yyyy-MM-dd")
try {
  $r = Invoke-WebRequest -Uri "$caBase/financeiro/eventos-financeiros/contas-a-receber/buscar?size=5&data_vencimento_de=$de&data_vencimento_ate=$ate" -Headers $authH -ErrorAction Stop
  Write-Host "✅ $($r.StatusCode)"
  $j = $r.Content | ConvertFrom-Json
  Write-Host "Total registros: $($j.totalElements) | Página: $($j.content.Count) items"
  if ($j.content.Count -gt 0) {
    Write-Host "Primeiro: $($j.content[0] | ConvertTo-Json -Depth 2)"
  }
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  try { $b = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream()).ReadToEnd() } catch { $b = "" }
  Write-Host "❌ $sc : $b"
}

Write-Host "`n=== 3. Vendas (últimos 36 meses) ==="
try {
  $r = Invoke-WebRequest -Uri "$caBase/venda/busca?size=5" -Headers $authH -ErrorAction Stop
  Write-Host "✅ $($r.StatusCode)"
  $j = $r.Content | ConvertFrom-Json
  Write-Host "Content: $($r.Content.Substring(0, [Math]::Min(300, $r.Content.Length)))"
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  try { $b = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream()).ReadToEnd() } catch { $b = "" }
  Write-Host "❌ $sc : $b"
}

Write-Host "`n=== 4. Pessoa/busca ==="
try {
  $r = Invoke-WebRequest -Uri "$caBase/pessoa/busca?size=5" -Headers $authH -ErrorAction Stop
  Write-Host "✅ $($r.StatusCode) | Content: $($r.Content.Substring(0, [Math]::Min(300, $r.Content.Length)))"
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  try { $b = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream()).ReadToEnd() } catch { $b = "" }
  Write-Host "❌ $sc : $b"
}
