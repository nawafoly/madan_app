$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Run-Step {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][scriptblock]$Command
  )
  Write-Host "`n[workforce-schedule-rollout] $Label" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed ($LASTEXITCODE): $Label"
  }
}

$repo = (Get-Location).Path
$expectedBranch = 'feat/restaurant-workforce-core-phase2'
$branch = (git branch --show-current).Trim()
if ($branch -ne $expectedBranch) {
  throw "Wrong branch: $branch. Expected: $expectedBranch"
}

Run-Step 'pull latest branch' { git pull --ff-only origin $expectedBranch }
Run-Step 'one-command local gate' { node scripts/gate-workforce-schedule-phase2.mjs }

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
  throw 'Rollout blocked: working tree contains files outside the two integration targets.'
}

if ($changedPaths.Count -gt 0) {
  Run-Step 'stage schedule integration only' {
    git add -- client/src/features/workforce/WorkforceEmployeeFile.tsx workers/workforce-core.js
  }
  Run-Step 'commit schedule integration' {
    git commit -m 'feat(workforce): integrate schedule exceptions and weekly rest resolver'
  }
  Run-Step 'push schedule integration' {
    git push origin $expectedBranch
  }
} else {
  Write-Host '[workforce-schedule-rollout] integration already committed; continuing.' -ForegroundColor DarkGray
}

Write-Host "`n[workforce-schedule-rollout] Production schema state check" -ForegroundColor Cyan
node scripts/report-workforce-schedule-production-schema.mjs --expect=0
$preflightZero = ($LASTEXITCODE -eq 0)

if (-not $preflightZero) {
  Write-Host '[workforce-schedule-rollout] Schema is not all-zero; checking whether migration 0003 was already fully applied.' -ForegroundColor Yellow
  node scripts/report-workforce-schedule-production-schema.mjs --expect=1
  if ($LASTEXITCODE -ne 0) {
    throw 'Rollout blocked: Production schema is mixed/partial. Neither all-0 nor all-1.'
  }
  Write-Host '[workforce-schedule-rollout] Migration 0003 is already fully applied; skipping D1 write.' -ForegroundColor Yellow
} else {
  Run-Step 'Production migration 0003' {
    npx wrangler d1 execute maedin-attendance `
      --remote `
      --config workers/wrangler.toml `
      --file workers/workforce-migrations/0003_workforce_schedule_control.sql
  }
}

Run-Step 'Production schema postflight: all 11 values must be 1' {
  node scripts/report-workforce-schedule-production-schema.mjs --expect=1
}

Run-Step 'deploy Worker upload' {
  npx wrangler deploy --config workers/wrangler.toml
}

$smokeBody = Join-Path $env:TEMP ("workforce-schedule-smoke-" + [guid]::NewGuid().ToString('N') + '.json')
try {
  Write-Host "`n[workforce-schedule-rollout] unauthenticated route smoke" -ForegroundColor Cyan
  $status = (& curl.exe -sS -o $smokeBody -w '%{http_code}' 'https://upload.maedin2026.workers.dev/attendance/habat/workforce/v1/employees/smoke-test/schedule/resolve?date=2026-09-07').Trim()
  $body = Get-Content -Raw $smokeBody
  Write-Host "HTTP $status"
  Write-Host $body
  if ($status -ne '401' -or $body -notmatch 'missing_firebase_id_token') {
    throw 'Unexpected smoke response. Expected 401 missing_firebase_id_token.'
  }
} finally {
  Remove-Item -Force -ErrorAction SilentlyContinue $smokeBody
}

Run-Step 'final git status' { git status --short }
$finalDirty = @(git status --porcelain=v1 --untracked-files=all)
if ($finalDirty.Count -ne 0) {
  throw 'Rollout completed but working tree is not clean.'
}

Write-Host "`n[workforce-schedule-rollout] PASS - Schedule Exceptions + Weekly Rest integrated, committed, migrated, deployed, and smoke-verified." -ForegroundColor Green
