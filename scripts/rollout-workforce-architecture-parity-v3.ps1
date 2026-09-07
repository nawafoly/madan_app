$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repo = "C:\Users\nawaf\Downloads\madan"
$branch = "fix/restaurant-workforce-architecture-parity"
$base = "habat-production"
$expectedBase = "1a5c36b254c82843d2a6c88fa77cbd8defdd3fba"

$runtimeFiles = @(
  "workers/workforce-core.js",
  "workers/workforce-schedule-control.js",
  "workers/habat-attendance-v2.js",
  "client/src/features/workforce/workforceClient.ts",
  "client/src/features/workforce/WorkforceEmployeeFile.tsx",
  "client/src/pages/habat/HabatAttendanceAdmin.tsx"
)
$toolingFiles = @("scripts/integrate-workforce-architecture-parity.mjs")
$allowed = @($runtimeFiles + $toolingFiles)

Set-Location $repo
Write-Host "`n=== WORKFORCE ARCHITECTURE PARITY ROLLOUT V3 ===" -ForegroundColor Cyan

git fetch origin
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

$baseHead = (git rev-parse "origin/$base").Trim()
Write-Host "origin/$base = $baseHead"
if ($baseHead -ne $expectedBase) {
  throw "STOP: habat-production moved. Re-review required before continuing."
}

# Recover only the exact partial edit left by the prior failed V2 preparation.
$dirtyBefore = @(git status --porcelain=v1 --untracked-files=all)
if ($dirtyBefore.Count -gt 0) {
  $dirtyNames = @(git diff --name-only)
  $recoverPath = "client/src/features/workforce/WorkforceEmployeeFile.tsx"
  if ($dirtyBefore.Count -eq 1 -and $dirtyNames.Count -eq 1 -and $dirtyNames[0] -eq $recoverPath) {
    $recoveryDiff = (git diff -- $recoverPath | Out-String)
    if ($recoveryDiff -match "reason\?: string \| null" -and $recoveryDiff -match "createdAt\?: string \| null") {
      Write-Host "Recovering partial V2 preparation edit..." -ForegroundColor Yellow
      git restore -- $recoverPath
    } else {
      $dirtyBefore
      throw "STOP: working tree contains an unrecognized local edit."
    }
  } else {
    Write-Host "Working tree is dirty:" -ForegroundColor Red
    $dirtyBefore
    throw "STOP: unrelated local work detected. Nothing changed."
  }
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

Write-Host "`n=== REPAIR + SYNTAX GATE ===" -ForegroundColor Cyan
node .\scripts\repair-workforce-parity-integrator.mjs
if ($LASTEXITCODE -ne 0) { throw "integrator repair failed" }

node --check .\scripts\prepare-workforce-parity-integration.mjs
if ($LASTEXITCODE -ne 0) { git restore -- $allowed; throw "prepare script syntax invalid" }
node --check .\scripts\integrate-workforce-architecture-parity.mjs
if ($LASTEXITCODE -ne 0) { git restore -- $allowed; throw "integrator syntax invalid" }

Write-Host "`n=== APPLY DETERMINISTIC INTEGRATION ===" -ForegroundColor Cyan
try {
  node .\scripts\prepare-workforce-parity-integration.mjs
  if ($LASTEXITCODE -ne 0) { throw "parity integration preparation failed" }

  node .\scripts\integrate-workforce-architecture-parity.mjs
  if ($LASTEXITCODE -ne 0) { throw "architecture parity integration failed" }
} catch {
  Write-Host "Integration failed; restoring all rollout-touched tracked files." -ForegroundColor Red
  git restore -- $allowed
  throw
}

Write-Host "`n=== SOURCE HYGIENE ===" -ForegroundColor Cyan
$changed = @(git diff --name-only)
$unexpected = @($changed | Where-Object { $_ -notin $allowed })
if ($unexpected.Count -gt 0) {
  Write-Host "Unexpected modified files:" -ForegroundColor Red
  $unexpected
  git restore -- $allowed
  throw "STOP: parity rollout touched files outside the approved set."
}
foreach ($protected in @("pnpm-lock.yaml", ".env.local")) {
  if ($changed -contains $protected) { git restore -- $allowed; throw "STOP: protected file changed: $protected" }
}
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
    npx wrangler d1 execute maedin-attendance --local --config workers/wrangler.hr.toml --persist-to $tempPersist --file $migration --yes
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

Write-Host "`n=== COMMIT + PUSH ===" -ForegroundColor Cyan
$changedAfter = @(git diff --name-only)
if ($changedAfter.Count -eq 0) {
  Write-Host "Integration already committed; no new commit required." -ForegroundColor Yellow
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
Write-Host "`nPASS - parity architecture integration, contracts, local D1 0001..0005, TypeScript and build are green." -ForegroundColor Green
Write-Host "NO production D1 migration or Worker/Pages deployment was performed." -ForegroundColor Yellow
