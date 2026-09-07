$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Run-Step {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][scriptblock]$Command
  )
  Write-Host "`n[workforce-payroll-adjustments-rollout] $Label" -ForegroundColor Cyan
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
  $bodyPath = Join-Path $env:TEMP ("workforce-payroll-smoke-" + [guid]::NewGuid().ToString('N') + '.json')
  try {
    Write-Host "`n[workforce-payroll-adjustments-rollout] smoke: $Label" -ForegroundColor Cyan
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
Run-Step 'payroll rollout safety contract' { node --test workers/workforce-payroll-adjustments-rollout-contract.test.mjs }
Run-Step 'payroll adjustment local gate' { node scripts/gate-workforce-payroll-adjustments-phase2.mjs }

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
  throw 'Rollout blocked: working tree contains files outside approved payroll integration targets.'
}

if ($changedPaths.Count -gt 0) {
  Run-Step 'stage payroll integration only' {
    git add -- client/src/features/workforce/WorkforceEmployeeFile.tsx workers/workforce-core.js
  }
  Run-Step 'commit payroll integration' {
    git commit -m 'feat(workforce): integrate manual payroll adjustments'
  }
  Run-Step 'push payroll integration' {
    git push origin $expectedBranch
  }
} else {
  Write-Host '[workforce-payroll-adjustments-rollout] integration already committed; continuing.' -ForegroundColor DarkGray
}

Write-Host "`n[workforce-payroll-adjustments-rollout] Production schema preflight" -ForegroundColor Cyan
& node scripts/report-workforce-payroll-adjustments-production-schema.mjs --expect=0
$schemaZero = $LASTEXITCODE
if ($schemaZero -eq 0) {
  Run-Step 'Production migration 0004' {
    npx wrangler d1 execute maedin-attendance --remote --config workers/wrangler.toml --file workers/workforce-migrations/0004_workforce_manual_payroll_adjustments.sql
  }
} else {
  Write-Host '[workforce-payroll-adjustments-rollout] schema is not all-zero; checking whether migration 0004 was already applied.' -ForegroundColor DarkGray
  & node scripts/report-workforce-payroll-adjustments-production-schema.mjs --expect=1
  if ($LASTEXITCODE -ne 0) {
    throw 'Payroll adjustment schema is mixed or unexpected. Migration/deploy blocked.'
  }
  Write-Host '[workforce-payroll-adjustments-rollout] migration 0004 already applied; skipping D1 mutation.' -ForegroundColor DarkGray
}

Run-Step 'Production schema postflight' {
  node scripts/report-workforce-payroll-adjustments-production-schema.mjs --expect=1
}

Run-Step 'deploy Worker upload' {
  npx wrangler deploy --config workers/wrangler.toml
}

Smoke-Route 'manual payroll adjustments' 'https://upload.maedin2026.workers.dev/attendance/habat/workforce/v1/employees/smoke-test/payroll-adjustments?month=2026-09'
Smoke-Route 'attendance operations regression' 'https://upload.maedin2026.workers.dev/attendance/habat/workforce/v1/employees/smoke-test/attendance-operations?month=2026-09'
Smoke-Route 'schedule regression' 'https://upload.maedin2026.workers.dev/attendance/habat/workforce/v1/employees/smoke-test/schedule/resolve?date=2026-09-07'

Run-Step 'final git status' { git status --short }
$finalDirty = @(git status --porcelain=v1 --untracked-files=all)
if ($finalDirty.Count -ne 0) {
  throw 'Rollout completed but working tree is not clean.'
}

Write-Host "`n[workforce-payroll-adjustments-rollout] PASS - manual payroll adjustments integrated, migrated, deployed, regression-smoked, and clean." -ForegroundColor Green
