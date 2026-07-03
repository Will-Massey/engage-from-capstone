# Wire Revolut Merchant API keys to engage-backend on Render.
# Usage:
#   1. Save keys to C:\Users\willi\boardroom\deploy\.revolut-merchant.env (gitignored)
#   2. .\scripts\wire-revolut-render.ps1
#   3. Optional: .\scripts\wire-revolut-render.ps1 -RegisterWebhook

param([switch]$RegisterWebhook)

$ErrorActionPreference = 'Stop'

$keyFile = 'C:\Users\willi\boardroom\deploy\.render-api-key'
$revolutFile = 'C:\Users\willi\boardroom\deploy\.revolut-merchant.env'
$engageServiceId = 'srv-d6qkjlua2pns73a2r1fg'
$webhookUrl = 'https://engage-backend-e1ue.onrender.com/api/billing/webhook'

if (-not (Test-Path $keyFile)) { throw 'Missing Render API key at boardroom/deploy/.render-api-key' }
if (-not (Test-Path $revolutFile)) {
  throw @"
Missing Revolut keys at boardroom/deploy/.revolut-merchant.env

Create the file with:
REVOLUT_API_SECRET_KEY=sk_...
REVOLUT_API_PUBLIC_KEY=pk_...
REVOLUT_WEBHOOK_SECRET=whsec_...
REVOLUT_API_URL=https://sandbox-merchant.revolut.com
ENGAGE_PLATFORM_FEE_BPS=250
"@
}

$apiKey = (Get-Content $keyFile -Raw).Trim()
$revolut = @{}
Get-Content $revolutFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $parts = $_ -split '=', 2
  $revolut[$parts[0].Trim()] = $parts[1].Trim()
}

foreach ($required in @('REVOLUT_API_SECRET_KEY', 'REVOLUT_API_PUBLIC_KEY')) {
  if (-not $revolut[$required]) { throw "Missing $required in .revolut-merchant.env" }
}

if ($RegisterWebhook -and -not $revolut['REVOLUT_WEBHOOK_SECRET']) {
  Write-Host 'Registering Engage webhook with Revolut...'
  $env:REVOLUT_API_SECRET_KEY = $revolut['REVOLUT_API_SECRET_KEY']
  $out = node 'C:\Users\willi\capstone-payments\scripts\setup-revolut-webhook.mjs' --url $webhookUrl 2>&1
  Write-Host $out
  if ($out -match 'whsec_[A-Za-z0-9_-]+') {
    $revolut['REVOLUT_WEBHOOK_SECRET'] = $Matches[0]
    Add-Content -Path $revolutFile -Value "REVOLUT_WEBHOOK_SECRET=$($Matches[0])"
    Write-Host 'Webhook secret saved to .revolut-merchant.env'
  }
}

if (-not $revolut['REVOLUT_WEBHOOK_SECRET']) {
  throw 'REVOLUT_WEBHOOK_SECRET missing — run with -RegisterWebhook or add whsec_... to .revolut-merchant.env'
}

$defaults = @{
  REVOLUT_API_URL = 'https://sandbox-merchant.revolut.com'
  ENGAGE_PLATFORM_FEE_BPS = '250'
}
foreach ($k in $defaults.Keys) {
  if (-not $revolut[$k]) { $revolut[$k] = $defaults[$k] }
}

$headers = @{ Authorization = "Bearer $apiKey"; 'Content-Type' = 'application/json' }
$existing = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$engageServiceId/env-vars" -Headers $headers
$map = @{}
foreach ($item in $existing) { $map[$item.envVar.key] = $item.envVar.value }

foreach ($k in $revolut.Keys) { $map[$k] = $revolut[$k] }

$body = $map.GetEnumerator() | ForEach-Object { @{ key = $_.Key; value = $_.Value } }
Invoke-RestMethod -Uri "https://api.render.com/v1/services/$engageServiceId/env-vars" -Method PUT -Headers $headers -Body ($body | ConvertTo-Json -Depth 3) | Out-Null
Invoke-RestMethod -Uri "https://api.render.com/v1/services/$engageServiceId/deploys" -Method POST -Headers @{ Authorization = "Bearer $apiKey" } | Out-Null

Write-Host 'Revolut env vars applied to engage-backend and redeploy triggered.'
Write-Host "Webhook URL: $webhookUrl"