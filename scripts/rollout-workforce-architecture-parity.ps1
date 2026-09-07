$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repo = "C:\Users\nawaf\Downloads\madan"
$branch = "fix/restaurant-workforce-architecture-parity"
$base = "habat-production"
$expectedBase = "1a5c36b254c82843d2a6c88fa77cbd8defdd3fba"

Set-Location $repo

Write-Host "`n=== WORKFORCE ARCHITECTURE PARITY ROLLOUT ===" -ForegroundColor Cyan

git fetch origin
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

$baseHead = (git rev-parse "origin/$base").Trim()
Write-Host "origin/$base = $baseHead"
if ($baseHead -ne $expectedBase) {
  throw "STOP: habat-production moved. Re-review the parity branch before continuing."
}

$currentDirty = @(git status --porcelain=v1 --untracked-files=all)
if ($currentDirty.Count -gt 0) {
  Write-Host "Working tree is dirty:" -ForegroundColor Red
  $currentDirty
  throw "Nothing changed. Clean/stash unrelated work first."
}

$exists = git branch --list $branch
if ($exists) {
  git switch $branch
  if ($LASTEXITCODE -ne 0) { throw "git switch failed" }
  git pull --ff-only origin $branch
} else {
  git switch -c $branch --track "origin/$branch"
}
if ($LASTEXITCODE -ne 0) { throw "branch sync failed" }

Write-Host "`n=== APPLY DETERMINISTIC INTEGRATION ===" -ForegroundColor Cyan
node .\scripts\integrate-workforce-architecture-parity.mjs
if ($LASTEXITCODE -ne 0) { throw "architecture parity integration failed" }

Write-Host "`n=== SOURCE HYGIENE ===" -ForegroundColor Cyan
$changed = @(git diff --name-only)
$allowed = @(
  "workers/workforce-core.js",
  "workers/workforce-schedule-control.js",
  "workers/habat-attendance-v2.js",
  "client/src/features/workforce/workforceClient.ts",
  "client/src/features/workforce/WorkforceEmployeeFile.tsx",
  "client/src/pages/habat/HabatAttendanceAdmin.tsx"
)
$unexpected = @($changed | Where-Object { $_ -notin $allowed })
if ($unexpected.Count -gt 0) {
  Write-Host "Unexpected modified files:" -ForegroundColor Red
  $unexpected
  throw "STOP: parity integrator touched files outside the approved runtime set."
}

foreach ($protected in @("pnpm-lock.yaml", ".env.local")) {
  if ($changed -contains $protected) { throw "STOP: protected file changed: $protected" }
}

Write-Host "Approved runtime changes:"
$changed | ForEach-Object { Write-Host " - $_" }

Write-Host "`n=== CONTRACTS ===" -ForegroundColor Cyan
node --test .\workers\workforce-architecture-parity-contract.test.mjs
if ($LASTEXITCODE -ne 0) { throw "architecture parity contract failed" }

node --test .\workers\workforce-schedule-control-contract.test.mjs
if ($LASTEXITCODE -ne 0) { throw "schedule regression contract failed" }

node --test .\workers\workforce-ui-contract.test.mjs
if ($LASTEXITCODE -ne 0) { throw "UI regression contract failed" }

node --test .\workers\workforce-payroll-lifecycle-contract.test.mjs
if ($LASTEXITCODE -ne 0) { throw "payroll lifecycle regression contract failed" }

node --test .\workers\workforce-payroll-readiness-contract.test.mjs
if ($LASTEXITCODE -ne 0) { throw "payroll readiness regression contract failed" }

Write-Host "`n=== TEMPORARY D1 MIGRATION PROOF ===" -ForegroundColor Cyan
$tempPersist = Join-Path $env:TEMP ("wf-parity-d1-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $tempPersist | Out-Null
try {
  foreach ($migration in @(
    "workers/workforce-migrations/0001_workforce_core_foundation.sql",
    "workers/workforce-migrations/0002_workforce_annual_leave_ledger.sql",
    "workers/workforce-migrations/0003_workforce_schedule_control.sql",
    "workers/workforce-migrations/0004_workforce_manual_payroll_adjustments.sql",
    "workers/workforce-migrations/0005_workforce_employee_weekly_schedule.sql"
  )) {
    Write-Host "Applying local-only: $migration"
    npx wrangler d1 execute maedin-attendance --local --persist-to $tempPersist --file $migration --yes
    if ($LASTEXITCODE -ne 0) { throw "Local migration proof failed at $migration" }
  }
} finally {
  Remove-Item -LiteralPath $tempPersist -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "`n=== TYPESCRIPT + BUILD ===" -ForegroundColor Cyan
pnpm check
if ($LASTEXITCODE -ne 0) { throw "pnpm check failed" }

pnpm build
if ($LASTEXITCODE -ne 0) { throw "pnpm build failed" }

Write-Host "`n=== COMMIT ===" -ForegroundColor Cyan
$changedAfter = @(git diff --name-only)
if ($changedAfter.Count -eq 0) {
  Write-Host "Runtime integration already committed; no new commit required." -ForegroundColor Yellow
} else {
  git add -- $allowed
  git commit -m "fix(workforce): restore employee-owned weekly rest and payroll UX parity"
  if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw "git push failed" }
}

Write-Host "`n=== FINAL ===" -ForegroundColor Cyan
$finalDirty = @(git status --porcelain=v1 --untracked-files=all)
if ($finalDirty.Count -gt 0) {
  $finalDirty
  throw "STOP: final working tree is not clean."
}

git branch --show-current
git rev-parse HEAD

Write-Host "`nPASS - employee weekly rest ownership, shift-template separation, payroll ordering, Habbat schedule bridge, contracts, local D1 proof, TypeScript and build are green." -ForegroundColor Green
Write-Host "NO production D1 migration or Worker/Pages deployment was performed." -ForegroundColor Yellow
