Write-Host "=== 1. Status da conexão ==="
try {
  $r = Invoke-RestMethod -Uri 'https://datacenter.radexperts.com.br/api/conta-azul/status'
  $r | ConvertTo-Json
} catch { Write-Host "ERRO: $_" }

Write-Host "`n=== 2. Financeiro ==="
try {
  $r = Invoke-RestMethod -Uri 'https://datacenter.radexperts.com.br/api/conta-azul/financeiro'
  if ($r.error) {
    Write-Host "ERRO: $($r.error) - $($r.message)"
  } else {
    Write-Host "Receitas: $($r.receitas.Count) | Despesas: $($r.despesas.Count)"
    Write-Host "Totais: $($r.totais | ConvertTo-Json)"
  }
} catch { Write-Host "ERRO HTTP: $_" }

Write-Host "`n=== 3. Vendas ==="
try {
  $r = Invoke-RestMethod -Uri 'https://datacenter.radexperts.com.br/api/conta-azul/vendas'
  if ($r.error) {
    Write-Host "ERRO: $($r.error) - $($r.message)"
  } else {
    Write-Host "Vendas: $($r.vendas.Count) | Total: $($r.total)"
  }
} catch { Write-Host "ERRO HTTP: $_" }

Write-Host "`n=== 4. Pessoas ==="
try {
  $r = Invoke-RestMethod -Uri 'https://datacenter.radexperts.com.br/api/conta-azul/pessoas'
  if ($r.error) {
    Write-Host "ERRO: $($r.error) - $($r.message)"
  } else {
    Write-Host "Pessoas: $($r.pessoas.Count)"
  }
} catch { Write-Host "ERRO HTTP: $_" }
