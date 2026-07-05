# Wire Revolut Business API (OAuth + account) to engage-backend on Render.
# Prereq: boardroom/deploy/.revolut-business.env from revolut-business-setup.mjs

param([switch]$SkipDeploy)

$ErrorActionPreference = 'Stop'

$keyFile = 'C:\Users\willi\boardroom\deploy\.render-api-key'
$businessFile = 'C:\Users\willi\boardroom\deploy\.revolut-business.env'
$engageServiceId = 'srv-d6qkjlua2pns73a2r1fg'

if (-not (Test-Path $keyFile)) { throw 'Missing Render API key at boardroom/deploy/.render-api-key' }
if (-not (Test-Path $businessFile)) {
  throw @"
Missing $businessFile

Run OAuth setup first:
  node scripts/revolut-business-setup.mjs --client-id <id> --private-key <privatecert.pem> --headed
"@
}

$business = @{}
Get-Content $businessFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $parts = $_ -split '=', 2
  $business[$parts[0].Trim()] = $parts[1].Trim()
}

foreach ($required in @(
  'REVOLUT_BUSINESS_API_URL',
  'REVOLUT_BUSINESS_CLIENT_ID',
  'REVOLUT_BUSINESS_REFRESH_TOKEN',
  'REVOLUT_BUSINESS_ACCOUNT_ID',
  'REVOLUT_BUSINESS_PRIVATE_KEY'
)) {
  if (-not $business[$required]) { throw "Missing $required in .revolut-business.env" }
}

. (Join-Path $PSScriptRoot 'render-env-guard.ps1')

$updates = @{
  REVOLUT_BUSINESS_API_URL = $business['REVOLUT_BUSINESS_API_URL']
  REVOLUT_BUSINESS_CLIENT_ID = $business['REVOLUT_BUSINESS_CLIENT_ID']
  REVOLUT_BUSINESS_REFRESH_TOKEN = $business['REVOLUT_BUSINESS_REFRESH_TOKEN']
  REVOLUT_BUSINESS_ACCOUNT_ID = $business['REVOLUT_BUSINESS_ACCOUNT_ID']
  REVOLUT_BUSINESS_PRIVATE_KEY = $business['REVOLUT_BUSINESS_PRIVATE_KEY']
}

if ($business['REVOLUT_BUSINESS_API_KEY']) {
  $updates['REVOLUT_BUSINESS_API_KEY'] = $business['REVOLUT_BUSINESS_API_KEY']
}
if ($business['ENGAGE_DEFAULT_AGENCY_COUNTERPARTY_ID']) {
  $updates['ENGAGE_DEFAULT_AGENCY_COUNTERPARTY_ID'] = $business['ENGAGE_DEFAULT_AGENCY_COUNTERPARTY_ID']
}

$params = @{
  ServiceId = $engageServiceId
  Updates = $updates
}
if ($SkipDeploy) { $params['SkipDeploy'] = $true }

Set-RenderEnvVarsSafe @params | Out-Null

Write-Host 'Revolut Business env vars applied to engage-backend.'
Write-Host "  URL: $($business['REVOLUT_BUSINESS_API_URL'])"
Write-Host "  Account: $($business['REVOLUT_BUSINESS_ACCOUNT_ID'])"
if (-not $SkipDeploy) { Write-Host 'Redeploy triggered.' }