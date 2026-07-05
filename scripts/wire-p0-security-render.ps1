# Wire P0 security secrets to engage-backend on Render (SECURITY_TODO items 1, 5, 6).
# Generates EMAIL_WEBHOOK_SECRET / AML_WEBHOOK_SECRET / E2E_BYPASS_SECRET when missing,
# preserves existing values, and mirrors them to boardroom/deploy/.engage-p0-secrets.env
# so smoke scripts can send X-Test-Mode-Secret.

param([switch]$SkipDeploy)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'render-env-guard.ps1')

$engageServiceId = $script:RenderEngageBackendId
$secretsFile = 'C:\Users\willi\boardroom\deploy\.engage-p0-secrets.env'

$existing = Get-RenderEnvVars -ServiceId $engageServiceId
$updates = @{}
$final = @{}

foreach ($key in @('EMAIL_WEBHOOK_SECRET', 'AML_WEBHOOK_SECRET', 'E2E_BYPASS_SECRET')) {
  if ($existing[$key] -and -not [string]::IsNullOrWhiteSpace($existing[$key])) {
    $final[$key] = $existing[$key]
    Write-Host "$key already set on Render - keeping existing value."
  } else {
    $value = (New-RandomSecretHex).Trim()
    $updates[$key] = $value
    $final[$key] = $value
    Write-Host "$key generated."
  }
}

if ($updates.Count -gt 0) {
  $params = @{ ServiceId = $engageServiceId; Updates = $updates }
  if ($SkipDeploy) { $params['SkipDeploy'] = $true }
  Set-RenderEnvVarsSafe @params | Out-Null
  Write-Host "Applied $($updates.Count) new secret(s) to engage-backend."
} else {
  Write-Host 'All P0 secrets already present - no PUT needed.'
}

$lines = foreach ($key in ($final.Keys | Sort-Object)) { "$key=$($final[$key])" }
Set-Content -Path $secretsFile -Value $lines -Encoding utf8NoBOM
Write-Host "Secrets mirrored to $secretsFile"
if (-not $SkipDeploy -and $updates.Count -gt 0) { Write-Host 'Redeploy triggered.' }
