#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Print canonical webhook URLs for Engage on capstonesoftware.co.uk/engage.
  Configure these in Cloudflare Email, Revolut, and Stripe dashboards.
#>
$base = 'https://capstonesoftware.co.uk/engage'
Write-Host "Canonical public base: $base" -ForegroundColor Cyan
Write-Host ""
Write-Host "Webhooks (configure in provider dashboards):" -ForegroundColor Yellow
Write-Host "  Cloudflare Email delivery: $base/api/webhooks/cloudflare-email"
Write-Host "  Stripe payments:           $base/api/payments/webhook"
Write-Host "  Revolut billing:             $base/api/billing/webhook"
Write-Host ""
Write-Host "Email worker (unchanged - Cloudflare Workers):" -ForegroundColor Yellow
Write-Host "  EMAIL_WORKER_URL: https://capstone-engage-email.william-19a.workers.dev"
Write-Host "  EMAIL_PLATFORM_FROM: proposals@capstonesoftware.co.uk"
Write-Host ""
Write-Host "OAuth redirect (Xero example):" -ForegroundColor Yellow
Write-Host "  $base/api/oauth/callback/xero"