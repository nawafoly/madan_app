$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Run-Step {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][scriptblock]$Command
  )
  Write-Host "`n[workforce-operations-rollout] $Label" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed ($LASTEXITCODE): $Label"
  }
}

function Smoke-Route {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][string]$Url
  )
  $bodyPath = Join-Path $env:TEMP ("workforce-ops-smoke-" + [guid]::NewGuid().ToString('N') + '.json')
  try {
    Write-Host "`n[workforce-operations-rollout] smoke: $Label" -ForegroundColor Cyan
    $status = (& curl.exe -sS -o $bodyPath -w '%{http_code}' $Url).Trim()
    $body = Get-Content -Raw $bodyPath
    Write-Host "HTTP $status"
    Write-Host $body
    if ($status -ne '401' -or $body -notmatch 'missing_firebase_id_token') {
      throw "Unexpected smoke response for $Label. Expected 401 missing_firebase_id_token."
    }
  } finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $bodyPath
  }
}

$expectedBranch = 'feat/restaurant-workforce-core-phase2'
$branch = (git branch --show-current).Trim()
if ($branch -ne $expectedBranch) {
  throw "Wrong branch: $branch. Expected: $expectedBranch"
}

Run-Step 'pull latest branch' { git pull --ff-only origin $expectedBranch }
Run-Step 'combined leave and attendance gate' { node scripts/gate-workforce-operations-phase2.mjs }

$expectedPaths = @(
  'client/src/features/workforce/WorkforceEmployeeFile.tsx',
  'workers/workforce-core.js',
  'workers/habat-workforce-adapter.js'
)
$changedPaths = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object {
  if ($_.Length -ge 4) { $_.Substring(3).Trim() }
} | Where-Object { $_ })
$unexpected = @($changedPaths | Where-Object { $_ -notin $expectedPaths })
if ($unexpected.Count -gt 0) {
  Write-Host 'Unexpected working-tree changes:' -ForegroundColor Red
  $unexpected | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  throw 'Rollout blocked: working tree contains files outside approved integration targets.'
}

if ($changedPaths.Count -gt 0) {
  Run-Step 'stage operations integration only' {
    git add -- client/src/features/workforce/WorkforceEmployeeFile.tsx workers/workforce-core.js workers/habat-workforce-adapter.js
  }
  Run-Step 'commit operations integration' {
    git commit -m 'feat(workforce): integrate leave lifecycle and attendance operations'
  }
  Run-Step 'push operations integration' {
    git push origin $expectedBranch
  }
} else {
  Write-Host '[workforce-operations-rollout] integration already committed; continuing.' -ForegroundColor DarkGray
}

Run-Step 'deploy Worker upload' {
  npx wrangler deploy --config workers/wrangler.toml
}

Smoke-Route 'leave lifecycle' 'https://upload.maedin2026.workers.dev/attendance/habat/workforce/v1/employees/smoke-test/leaves'
Smoke-Route 'attendance operations' 'https://upload.maedin2026.workers.dev/attendance/habat/workforce/v1/employees/smoke-test/attendance-operations?month=2026-09'
Smoke-Route 'schedule regression' 'https://upload.maedin2026.workers.dev/attendance/habat/workforce/v1/employees/smoke-test/schedule/resolve?date=2026-09-07'

Run-Step 'final git status' { git status --short }
$finalDirty = @(git status --porcelain=v1 --untracked-files=all)
if ($finalDirty.Count -ne 0) {
  throw 'Rollout completed but working tree is not clean.'
}

Write-Host "`n[workforce-operations-rollout] PASS - leave lifecycle and attendance operations integrated, committed, deployed, regression-smoked, and clean." -ForegroundColor Green
