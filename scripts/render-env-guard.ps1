# Shared helpers for Render env-var PUT — always preserve DATABASE_URL + production secrets.
# Any script that PUTs /services/{id}/env-vars MUST call Ensure-RenderCoreEnvVars first.

$script:RenderEngageBackendId = 'srv-d6qkjlua2pns73a2r1fg'
$script:RenderEngageDbId = 'dpg-d6qkjbma2pns73a2qoe0-a'

function Get-RenderApiKey {
  if ($env:RENDER_API_KEY) { return $env:RENDER_API_KEY.Trim() }
  $keyFile = 'C:\Users\willi\boardroom\deploy\.render-api-key'
  if (Test-Path $keyFile) { return (Get-Content $keyFile -Raw).Trim() }
  throw 'RENDER_API_KEY not set and boardroom/deploy/.render-api-key missing'
}

function Get-RenderEnvVars {
  param(
    [string]$ServiceId,
    [string]$ApiKey = (Get-RenderApiKey)
  )
  $headers = @{ Authorization = "Bearer $ApiKey"; Accept = 'application/json' }
  $existing = @{}
  $cursor = $null
  do {
    $path = "/services/$ServiceId/env-vars?limit=100"
    if ($cursor) { $path += "&cursor=$cursor" }
    $page = Invoke-RestMethod -Method GET -Uri "https://api.render.com/v1$path" -Headers $headers
    foreach ($item in $page) { $existing[$item.envVar.key] = $item.envVar.value }
    $cursor = if ($page.Count -gt 0) { $page[-1].cursor } else { $null }
  } while ($cursor -and $page.Count -eq 100)
  return $existing
}

function Get-EngageDatabaseUrl {
  param([string]$ApiKey = (Get-RenderApiKey))
  $headers = @{ Authorization = "Bearer $ApiKey" }
  $conn = Invoke-RestMethod -Uri "https://api.render.com/v1/postgres/$script:RenderEngageDbId/connection-info" -Headers $headers
  $url = $conn.internalConnectionString
  if ($url -notmatch '\?') { $url += '?sslmode=require' }
  return $url
}

function New-RandomSecretHex {
  param([int]$Bytes = 32)
  node -e "console.log(require('crypto').randomBytes($Bytes).toString('hex'))"
}

function Ensure-RenderCoreEnvVars {
  <#
    Inject DATABASE_URL + production secrets before any env-var PUT.
    DATABASE_URL is often missing from GET (DB link) — PUT without it wipes the variable.
  #>
  param(
    [hashtable]$EnvMap,
    [switch]$ForceNewSecrets
  )

  $EnvMap['DATABASE_URL'] = Get-EngageDatabaseUrl

  foreach ($key in @('ENCRYPTION_KEY', 'OAUTH_STATE_SECRET')) {
    $current = $EnvMap[$key]
    if ($ForceNewSecrets -or -not $current -or [string]::IsNullOrWhiteSpace($current)) {
      $EnvMap[$key] = (New-RandomSecretHex).Trim()
    }
  }

  if (-not $EnvMap['NODE_ENV']) { $EnvMap['NODE_ENV'] = 'production' }
  return $EnvMap
}

function Set-RenderEnvVarsSafe {
  param(
    [string]$ServiceId,
    [hashtable]$Updates = @{},
    [switch]$SkipDeploy,
    [switch]$ForceNewSecrets
  )

  $apiKey = Get-RenderApiKey
  $headers = @{ Authorization = "Bearer $apiKey"; 'Content-Type' = 'application/json' }

  $existing = Get-RenderEnvVars -ServiceId $ServiceId -ApiKey $apiKey
  foreach ($kv in $Updates.GetEnumerator()) { $existing[$kv.Key] = $kv.Value }
  [void](Ensure-RenderCoreEnvVars -EnvMap $existing -ForceNewSecrets:$ForceNewSecrets)

  $payload = @(
    foreach ($key in ($existing.Keys | Sort-Object -Unique)) {
      @{ key = $key; value = [string]$existing[$key] }
    }
  )

  Invoke-RestMethod -Method PUT -Uri "https://api.render.com/v1/services/$ServiceId/env-vars" -Headers $headers -Body ($payload | ConvertTo-Json -Depth 5 -Compress) | Out-Null

  $verify = Get-RenderEnvVars -ServiceId $ServiceId -ApiKey $apiKey
  $required = @('DATABASE_URL', 'ENCRYPTION_KEY', 'OAUTH_STATE_SECRET')
  $missing = $required | Where-Object { -not $verify.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($verify[$_]) }
  if ($missing) { throw "Render env guard failed - missing after PUT: $($missing -join ', ')" }

  if (-not $SkipDeploy) {
    $deployBody = @{ clearCache = 'do_not_clear' } | ConvertTo-Json -Compress
    Invoke-RestMethod -Method POST -Uri "https://api.render.com/v1/services/$ServiceId/deploys" -Headers @{ Authorization = "Bearer $apiKey" } -ContentType 'application/json' -Body $deployBody | Out-Null
  }

  return $verify.Keys.Count
}