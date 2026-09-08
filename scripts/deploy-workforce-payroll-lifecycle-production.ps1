$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Run-Step {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][scriptblock]$Command
  )
  Write-Host "`n[workforce-payroll-lifecycle-rollout] $Label" -ForegroundColor Cyan
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
  $bodyPath = Join-Path $env:TEMP ("workforce-lifecycle-smoke-" + [guid]::NewGuid().ToString('N') + '.json')
  try {
    Write-Host "`n[workforce-payroll-lifecycle-rollout] smoke: $Label" -ForegroundColor Cyan
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
Run-Step 'rollout safety contract' { node --test workers/workforce-payroll-lifecycle-rollout-contract.test.mjs }
Run-Step 'payroll lifecycle local gate' { node scripts/gate-workforce-payroll-lifecycle-phase2.mjs }

$expectedPaths = @(
  'client/src/features/workforce/WorkforceEmployeeFile.tsx',
  'workers/workforce-core.js'
)
$changedPaths = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object {
  if ($_.Length -ge 4) { $_.Substring(3).Trim() }
} | Where-Object { $_ })
$unexpected = @($changedPaths | Where-Object { $_ -notin $expectedPaths })
if ($unexpected.Count -gt 0) {
  Write-Host 'Unexpected working-tree changes:' -ForegroundColor Red
  $unexpected | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  throw 'Rollout blocked: working tree contains files outside approved lifecycle integration targets.'
}

if ($changedPaths.Count -gt 0) {
  Run-Step 'stage lifecycle integration only' {
    git add -- client/src/features/workforce/WorkforceEmployeeFile.tsx workers/workforce-core.js
  }
  Run-Step 'commit lifecycle integration' {
    git commit -m 'feat(workforce): integrate payroll lifecycle controls'
  }
  Run-Step 'push lifecycle integration' {
    git push origin $expectedBranch
  }
} else {
  Write-Host '[workforce-payroll-lifecycle-rollout] integration already committed; continuing.' -ForegroundColor DarkGray
}

Run-Step 'deploy Worker upload' {
  npx wrangler deploy --config workers/wrangler.toml
}

Smoke-Route 'payroll lifecycle' 'https://upload.maedin2026.workers.dev/attendance/habat/workforce/v1/employees/smoke-test/payroll-lifecycle?month=2026-09'
Smoke-Route 'payroll readiness regression' 'https://upload.maedin2026.workers.dev/attendance/habat/workforce/v1/employees/smoke-test/payroll-readiness?month=2026-09'
Smoke-Route 'manual payroll adjustments regression' 'https://upload.maedin2026.workers.dev/attendance/habat/workforce/v1/employees/smoke-test/payroll-adjustments?month=2026-09'
Smoke-Route 'attendance operations regression' 'https://upload.maedin2026.workers.dev/attendance/habat/workforce/v1/employees/smoke-test/attendance-operations?month=2026-09'
Smoke-Route 'leave lifecycle regression' 'https://upload.maedin2026.workers.dev/attendance/habat/workforce/v1/employees/smoke-test/leaves'
Smoke-Route 'schedule regression' 'https://upload.maedin2026.workers.dev/attendance/habat/workforce/v1/employees/smoke-test/schedule/resolve?date=2026-09-07'

Run-Step 'final git status' { git status --short }
$finalDirty = @(git status --porcelain=v1 --untracked-files=all)
if ($finalDirty.Count -ne 0) {
  throw 'Rollout completed but working tree is not clean.'
}

Write-Host "`n[workforce-payroll-lifecycle-rollout] PASS - payroll lifecycle integrated, deployed, regression-smoked, and clean." -ForegroundColor Green
