# Wire Stripe (platform + Connect) env vars to engage-backend on Render.
# Expects secrets in C:\Users\willi\boardroom\deploy\.engage-stripe.env
# (created by running the Stripe webhook setup — see docs/PAYMENT_COLLECTION.md).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\wire-stripe-render.ps1
#   powershell ... -File scripts\wire-stripe-render.ps1 -SkipDeploy

param([switch]$SkipDeploy)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'render-env-guard.ps1')

$secretsFile = 'C:\Users\willi\boardroom\deploy\.engage-stripe.env'
if (-not (Test-Path $secretsFile)) {
  throw "Missing $secretsFile — create it with STRIPE_* keys + webhook secrets first."
}

$stripe = @{}
Get-Content $secretsFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { $stripe[$matches[1]] = $matches[2] }
}

$required = @(
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  'STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET',
  'STRIPE_STARTER_PRICE_ID',
  'STRIPE_PROFESSIONAL_PRICE_ID',
  'STRIPE_ENTERPRISE_PRICE_ID'
)
$missing = $required | Where-Object { -not $stripe[$_] }
if ($missing) { throw "Missing keys in $secretsFile : $($missing -join ', ')" }

$updates = @{
  STRIPE_SECRET_KEY                     = $stripe.STRIPE_SECRET_KEY
  STRIPE_PUBLISHABLE_KEY                = $stripe.STRIPE_PUBLISHABLE_KEY
  STRIPE_WEBHOOK_SECRET                 = $stripe.STRIPE_WEBHOOK_SECRET
  STRIPE_CONNECT_WEBHOOK_SECRET         = $stripe.STRIPE_CONNECT_WEBHOOK_SECRET
  STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET = $stripe.STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET
  STRIPE_STARTER_PRICE_ID               = $stripe.STRIPE_STARTER_PRICE_ID
  STRIPE_PROFESSIONAL_PRICE_ID          = $stripe.STRIPE_PROFESSIONAL_PRICE_ID
  STRIPE_ENTERPRISE_PRICE_ID            = $stripe.STRIPE_ENTERPRISE_PRICE_ID
  ENGAGE_PLATFORM_FEE_BPS               = '250'
  ENGAGE_STRIPE_PROCESSOR_BPS           = '150'
  ENGAGE_STRIPE_PROCESSOR_FIXED_PENCE   = '20'
}

if ($stripe.STRIPE_STARTER_ANNUAL_PRICE_ID) {
  $updates.STRIPE_STARTER_ANNUAL_PRICE_ID = $stripe.STRIPE_STARTER_ANNUAL_PRICE_ID
}
if ($stripe.STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID) {
  $updates.STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID = $stripe.STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID
}
if ($stripe.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID) {
  $updates.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID = $stripe.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID
}

Write-Host "Pushing $($updates.Count) Stripe env vars to engage-backend..."
$params = @{ ServiceId = $script:RenderEngageBackendId; Updates = $updates }
if ($SkipDeploy) { $params['SkipDeploy'] = $true }
Set-RenderEnvVarsSafe @params | Out-Null
Write-Host 'Done. Stripe keys are on Render (test or live depending on secrets file).'
