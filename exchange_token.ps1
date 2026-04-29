$body = '{"code":"1d805298-2f32-4af1-acd8-4ea8bf6fdafd"}'
try {
  $r = Invoke-WebRequest -Method POST -Uri 'https://datacenter.radexperts.com.br/api/conta-azul/auth' -ContentType 'application/json' -Body $body
  Write-Host "STATUS: $($r.StatusCode)"
  Write-Host $r.Content
} catch {
  Write-Host "STATUS: $($_.Exception.Response.StatusCode.value__)"
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  Write-Host "BODY: $($reader.ReadToEnd())"
}
