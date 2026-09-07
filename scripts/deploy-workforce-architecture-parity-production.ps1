$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Run-Step {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][scriptblock]$Command
  )
  Write-Host "`n[workforce-parity-production] $Label" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed ($LASTEXITCODE): $Label"
  }
}

$expectedBranch = 'fix/restaurant-workforce-architecture-parity'
$baseBranch = 'habat-production'
$expectedBase = '1a5c36b254c82843d2a6c88fa77cbd8defdd3fba'
$requiredRuntimeCommit = '670783f72dcfaa7ea337b6de7b03bc8dbd4dd481'
$workerBase = 'https://upload.maedin2026.workers.dev'

$branch = (git branch --show-current).Trim()
if ($branch -ne $expectedBranch) {
  throw "Wrong branch: $branch. Expected: $expectedBranch"
}

Run-Step 'fetch latest refs' { git fetch origin }
$baseHead = (git rev-parse "origin/$baseBranch").Trim()
Write-Host "origin/$baseBranch = $baseHead"
if ($baseHead -ne $expectedBase) {
  throw 'STOP: habat-production moved. Re-review required before production rollout.'
}

Run-Step 'pull latest parity branch' { git pull --ff-only origin $expectedBranch }
Run-Step 'verify approved runtime commit is an ancestor' { git merge-base --is-ancestor $requiredRuntimeCommit HEAD }

$dirty = @(git status --porcelain=v1 --untracked-files=all)
if ($dirty.Count -gt 0) {
  Write-Host 'Working tree is dirty:' -ForegroundColor Red
  $dirty
  throw 'STOP: production rollout requires a clean working tree.'
}

Run-Step 'architecture parity contract' { node --test .\workers\workforce-architecture-parity-contract.test.mjs }
Run-Step 'schedule regression contract' { node --test .\workers\workforce-schedule-control-contract.test.mjs }
Run-Step 'TypeScript gate' { pnpm check }

Write-Host "`n[workforce-parity-production] Remote schema preflight for migration 0005" -ForegroundColor Cyan
node .\scripts\report-workforce-weekly-schedule-production-schema.mjs --expect=0
$schemaIsZero = ($LASTEXITCODE -eq 0)

if (-not $schemaIsZero) {
  Write-Host '[workforce-parity-production] Schema is not all-zero; checking fully-applied state.' -ForegroundColor Yellow
  node .\scripts\report-workforce-weekly-schedule-production-schema.mjs --expect=1
  if ($LASTEXITCODE -ne 0) {
    throw 'STOP: migration 0005 schema is mixed/partial. No Worker deploy performed.'
  }
  Write-Host '[workforce-parity-production] Migration 0005 already fully applied; skipping D1 write.' -ForegroundColor Yellow
} else {
  Run-Step 'Production migration 0005 - employee-owned weekly schedule' {
    npx wrangler d1 execute maedin-attendance `
      --remote `
      --yes `
      --config workers/wrangler.toml `
      --file workers/workforce-migrations/0005_workforce_employee_weekly_schedule.sql
  }
}

Run-Step 'Production schema postflight - all 7 checks must be 1' {
  node .\scripts\report-workforce-weekly-schedule-production-schema.mjs --expect=1
}

Run-Step 'Deploy production Worker upload' {
  npx wrangler deploy --config workers/wrangler.toml
}

function Assert-AuthBoundary {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][string]$Url
  )
  $bodyFile = Join-Path $env:TEMP ("wf-parity-smoke-" + [guid]::NewGuid().ToString('N') + '.json')
  try {
    Write-Host "`n[workforce-parity-production] smoke: $Label" -ForegroundColor Cyan
    $status = (& curl.exe -sS -o $bodyFile -w '%{http_code}' $Url).Trim()
    $body = Get-Content -Raw $bodyFile -ErrorAction SilentlyContinue
    Write-Host "HTTP $status"
    Write-Host $body
    if ($status -ne '401' -or $body -notmatch 'missing_firebase_id_token') {
      throw "Unexpected auth-boundary smoke for $Label. Expected 401 missing_firebase_id_token."
    }
  } finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $bodyFile
  }
}

Assert-AuthBoundary -Label 'Habbat v2 context' -Url "$workerBase/attendance/habat/v2/context"
Assert-AuthBoundary -Label 'Workforce employee schedule resolver' -Url "$workerBase/attendance/habat/workforce/v1/employees/smoke-test/schedule/resolve?date=2026-09-07"

$finalDirty = @(git status --porcelain=v1 --untracked-files=all)
if ($finalDirty.Count -gt 0) {
  $finalDirty
  throw 'STOP: rollout completed but working tree is not clean.'
}

Write-Host "`nPASS - migration 0005 is fully applied, Worker is deployed, Habbat/Workforce auth boundaries are healthy, and the repository is clean." -ForegroundColor Green
Write-Host 'Pages production was NOT changed. Visual/authenticated parity verification is the next release gate.' -ForegroundColor Yellow
