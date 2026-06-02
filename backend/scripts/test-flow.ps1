# Local API flow test — run while backend is on http://localhost:3001
$base = "http://localhost:3001"
$ErrorActionPreference = "Stop"

function Test-Step($name, $script) {
  Write-Host "`n=== $name ===" -ForegroundColor Cyan
  & $script
}

$results = @()

Test-Step "Health /ping" {
  $r = Invoke-RestMethod "$base/ping"
  if ($r.status -ne "ok") { throw "ping failed" }
  Write-Host "OK: ping"
  $results += "ping: pass"
}

Test-Step "Diagnostic /api/diagnostic" {
  $r = Invoke-RestMethod "$base/api/diagnostic"
  if (-not $r.success) { throw "diagnostic failed: $($r | ConvertTo-Json -Compress)" }
  Write-Host "OK: $($r.checks.database), tenants=$($r.checks.tenants)"
  $results += "diagnostic: pass"
}

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Test-Step "Login" {
  $body = '{"email":"admin@demo.practice","password":"DemoPass123!"}'
  $resp = Invoke-WebRequest -Uri "$base/api/auth/login" -Method POST -Body $body -ContentType "application/json" -WebSession $session
  $json = $resp.Content | ConvertFrom-Json
  if (-not $json.success) { throw "login failed" }
  $script:token = $json.data.tokens.accessToken
  Write-Host "OK: logged in as $($json.data.user.email)"
  $results += "login: pass"
}

Test-Step "CSRF + /api/status" {
  $resp = Invoke-WebRequest -Uri "$base/api/status" -WebSession $session
  $csrfCookie = $session.Cookies.GetCookies([Uri]$base) | Where-Object { $_.Name -eq "csrfToken" }
  if (-not $csrfCookie) { throw "no csrf cookie" }
  $script:csrf = $csrfCookie.Value
  Write-Host "OK: csrf token obtained"
  $results += "csrf: pass"
}

Test-Step "GET /api/proposals" {
  $headers = @{
    Authorization = "Bearer $token"
    "X-CSRF-Token" = $csrf
  }
  $r = Invoke-RestMethod -Uri "$base/api/proposals" -Headers $headers -WebSession $session
  if (-not $r.success) { throw "list proposals failed" }
  Write-Host "OK: $($r.meta.total) proposal(s)"
  $results += "list proposals: pass"
}

Test-Step "GET /api/clients" {
  $headers = @{
    Authorization = "Bearer $token"
    "X-CSRF-Token" = $csrf
  }
  $r = Invoke-RestMethod -Uri "$base/api/clients" -Headers $headers -WebSession $session
  if (-not $r.success) { throw "list clients failed" }
  $script:clientId = $r.data[0].id
  if (-not $clientId) { throw "no clients" }
  Write-Host "OK: client $($r.data[0].name)"
  $results += "list clients: pass"
}

Test-Step "GET /api/services" {
  $headers = @{
    Authorization = "Bearer $token"
    "X-CSRF-Token" = $csrf
  }
  $r = Invoke-RestMethod -Uri "$base/api/services" -Headers $headers -WebSession $session
  if (-not $r.success) { throw "list services failed" }
  $script:serviceId = $r.data[0].id
  if (-not $serviceId) { throw "no services" }
  Write-Host "OK: service $($r.data[0].name)"
  $results += "list services: pass"
}

Test-Step "POST /api/proposals (create)" {
  $headers = @{
    Authorization = "Bearer $token"
    "X-CSRF-Token" = $csrf
    "Content-Type" = "application/json"
  }
  $payload = @{
    clientId = $clientId
    title = "Automated flow test proposal"
    services = @(@{ serviceId = $serviceId; quantity = 1 })
  } | ConvertTo-Json -Depth 5
  $resp = Invoke-WebRequest -Uri "$base/api/proposals" -Method POST -Body $payload -Headers $headers -WebSession $session
  $json = $resp.Content | ConvertFrom-Json
  if (-not $json.success) { throw "create proposal failed: $($resp.Content)" }
  $script:proposalId = $json.data.id
  Write-Host "OK: created $($json.data.reference) status=$($json.data.status)"
  $results += "create proposal: pass"
}

Test-Step "GET /api/proposals/:id" {
  $headers = @{
    Authorization = "Bearer $token"
    "X-CSRF-Token" = $csrf
  }
  $r = Invoke-RestMethod -Uri "$base/api/proposals/$proposalId" -Headers $headers -WebSession $session
  if (-not $r.success -or $r.data.id -ne $proposalId) { throw "get proposal failed" }
  Write-Host "OK: $($r.data.title)"
  $results += "get proposal: pass"
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "FLOW TEST SUMMARY ($($results.Count)/$($results.Count) passed)" -ForegroundColor Green
$results | ForEach-Object { Write-Host "  $_" }
