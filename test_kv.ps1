$kvUrl   = "https://lasting-trout-109714.upstash.io"
$kvToken = "gQAAAAAAAaySAAIgcDJlNTI4YmM1OGY5NGM0YTZlOTJkYTU3Y2Q4MDg3ZmIzNA"
$headers = @{ Authorization = "Bearer $kvToken" }

Write-Host "--- Test 1: SET with string body ---"
try {
  $r = Invoke-RestMethod -Uri "$kvUrl/set/ca:test" -Method POST -Headers $headers -ContentType "application/json" -Body '"hello_world"'
  Write-Host "SET result: $($r | ConvertTo-Json)"
} catch { Write-Host "SET error: $_" }

Write-Host "--- Test 2: GET ---"
try {
  $r = Invoke-RestMethod -Uri "$kvUrl/get/ca:test" -Method GET -Headers $headers
  Write-Host "GET result: $($r | ConvertTo-Json)"
} catch { Write-Host "GET error: $_" }
