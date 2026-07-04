#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'render-env-guard.ps1')
$vars = Get-RenderEnvVars -ServiceId $RenderEngageBackendId
Write-Host "SUPERADMIN_URL=$($vars['SUPERADMIN_URL'])"
Write-Host "SUPERADMIN_WEBHOOK_SECRET set=$($vars.ContainsKey('SUPERADMIN_WEBHOOK_SECRET') -and -not [string]::IsNullOrWhiteSpace($vars['SUPERADMIN_WEBHOOK_SECRET']))"
Write-Host "SUPERADMIN_API_KEY present=$($vars.ContainsKey('SUPERADMIN_API_KEY'))"