# Upgrade engage-backend to Starter + attach persistent disk via Render API.
# If PATCH returns 500, upgrade manually: https://dashboard.render.com/web/srv-d6qkjlua2pns73a2r1fg
# Then add disk: Settings → Disks → Add disk → mount /var/data, 10 GB

param(
  [string]$ServiceId = 'srv-d6qkjlua2pns73a2r1fg',
  [string]$ApiKeyPath = 'C:\Users\willi\boardroom\deploy\.render-api-key'
)

$key = (Get-Content $ApiKeyPath -Raw).Trim()
$headers = @{ Authorization = "Bearer $key"; 'Content-Type' = 'application/json' }

Write-Host '1. Upgrade plan to starter...'
try {
  $up = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$ServiceId" -Method PATCH -Headers $headers -Body '{"serviceDetails":{"plan":"starter"}}'
  Write-Host "   Plan:" $up.serviceDetails.plan
} catch {
  Write-Host '   API upgrade failed — use dashboard:' $_.Exception.Message
  Write-Host '   https://dashboard.render.com/web/srv-d6qkjlua2pns73a2r1fg/settings'
}

Write-Host '2. Attach disk (requires starter)...'
$diskBody = (@{
  name = 'engage-uploads'
  sizeGB = 10
  mountPath = '/var/data'
  serviceId = $ServiceId
} | ConvertTo-Json -Compress)
try {
  $disk = Invoke-RestMethod -Uri 'https://api.render.com/v1/disks' -Method POST -Headers $headers -Body $diskBody
  Write-Host '   Disk:' ($disk | ConvertTo-Json -Compress)
} catch {
  Write-Host '   Disk error:' $_.ErrorDetails.Message
}

Write-Host '3. Trigger deploy...'
$dep = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$ServiceId/deploys" -Method POST -Headers $headers -Body '{"clearCache":"do_not_clear"}'
Write-Host '   Deploy:' $dep.id