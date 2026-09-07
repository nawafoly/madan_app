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
$locallyMutableTooling = @(
  "scripts/integrate-workforce-architecture-parity.mjs"
)
$rolloutTouched = @($runtimeFiles + $locallyMutableTooling)

Set-Location $repo
Write-Host "`n=== WORKFORCE ARCHITECTURE PARITY ROLLOUT V4 ===" -ForegroundColor Cyan

function Save-FailurePatch([string]$label) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $path = "C:\Users\nawaf\Downloads\madan-parity-$label-$stamp.patch"
  $patch = (git diff -- $rolloutTouched | Out-String)
  if ($patch.Trim()) {
    Set-Content -LiteralPath $path -Value $patch -Encoding UTF8
    Write-Host "Saved diagnostic patch: $path" -ForegroundColor Yellow
  }
}

function Restore-RolloutTouched {
  git restore -- $rolloutTouched
}

function Stop-And-Restore([string]$message, [string]$label = "failed") {
  Save-FailurePatch $label
  Restore-RolloutTouched
  throw $message
}

git fetch origin
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

$baseHead = (git rev-parse "origin/$base").Trim()
Write-Host "origin/$base = $baseHead"
if ($baseHead -ne $expectedBase) {
  throw "STOP: habat-production moved. Re-review required before continuing."
}

# Recover only files that our failed V2/V3 rollout is known to have touched.
$dirtyBefore = @(git status --porcelain=v1 --untracked-files=all)
if ($dirtyBefore.Count -gt 0) {
  $dirtyTracked = @(git diff --name-only)
  $unknownTracked = @($dirtyTracked | Where-Object { $_ -notin $rolloutTouched })
  $untracked = @($dirtyBefore | Where-Object { $_ -match '^\?\?' })

  if ($unknownTracked.Count -gt 0 -or $untracked.Count -gt 0) {
    Write-Host "Working tree contains unrelated changes:" -ForegroundColor Red
    $dirtyBefore
    throw "STOP: unrelated local work detected. Nothing was restored."
  }

  if ($dirtyTracked.Count -gt 0) {
    Write-Host "Recovering files left dirty by failed parity rollout..." -ForegroundColor Yellow
    Save-FailurePatch "v3-recovery"
    git restore -- $rolloutTouched
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

Write-Host "`n=== REPAIR TOOLING + SYNTAX ===" -ForegroundColor Cyan
node .\scripts\repair-workforce-parity-integrator.mjs
if ($LASTEXITCODE -ne 0) { Stop-And-Restore "integrator repair failed" "repair" }

foreach ($script in @(
  ".\scripts\prepare-workforce-parity-integration.mjs",
  ".\scripts\integrate-workforce-architecture-parity.mjs",
  ".\scripts\finalize-workforce-parity-integration.mjs"
)) {
  node --check $script
  if ($LASTEXITCODE -ne 0) { Stop-And-Restore "tooling syntax invalid: $script" "tooling-syntax" }
}

Write-Host "`n=== APPLY DETERMINISTIC INTEGRATION ===" -ForegroundColor Cyan
try {
  node .\scripts\prepare-workforce-parity-integration.mjs
  if ($LASTEXITCODE -ne 0) { throw "parity integration preparation failed" }

  node .\scripts\integrate-workforce-architecture-parity.mjs
  if ($LASTEXITCODE -ne 0) { throw "architecture parity integration failed" }

  node .\scripts\finalize-workforce-parity-integration.mjs
  if ($LASTEXITCODE -ne 0) { throw "architecture parity finalization failed" }
} catch {
  Stop-And-Restore $_.Exception.Message "integration"
}

Write-Host "`n=== SOURCE HYGIENE ===" -ForegroundColor Cyan
$changed = @(git diff --name-only)
$unexpected = @($changed | Where-Object { $_ -notin $rolloutTouched })
if ($unexpected.Count -gt 0) {
  Write-Host "Unexpected modified files:" -ForegroundColor Red
  $unexpected
  Stop-And-Restore "STOP: parity rollout touched files outside approved runtime/tooling set." "source-hygiene"
}
foreach ($protected in @("pnpm-lock.yaml", ".env.local")) {
  if ($changed -contains $protected) { Stop-And-Restore "STOP: protected file changed: $protected" "protected-file" }
}
$changed | ForEach-Object { Write-Host " - $_" }

Write-Host "`n=== RUNTIME SYNTAX + TYPESCRIPT FIRST ===" -ForegroundColor Cyan
foreach ($jsFile in @(
  ".\workers\workforce-core.js",
  ".\workers\workforce-schedule-control.js",
  ".\workers\habat-attendance-v2.js"
)) {
  node --check $jsFile
  if ($LASTEXITCODE -ne 0) { Stop-And-Restore "runtime JavaScript syntax invalid: $jsFile" "runtime-syntax" }
}

pnpm check
if ($LASTEXITCODE -ne 0) { Stop-And-Restore "pnpm check failed" "typescript" }

Write-Host "`n=== CONTRACTS ===" -ForegroundColor Cyan
foreach ($contract in @(
  ".\workers\workforce-architecture-parity-contract.test.mjs",
  ".\workers\workforce-schedule-control-contract.test.mjs",
  ".\workers\workforce-ui-contract.test.mjs",
  ".\workers\workforce-payroll-lifecycle-contract.test.mjs",
  ".\workers\workforce-payroll-readiness-contract.test.mjs"
)) {
  node --test $contract
  if ($LASTEXITCODE -ne 0) { Stop-And-Restore "contract failed: $contract" "contract" }
}

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
} catch {
  Remove-Item -LiteralPath $tempPersist -Recurse -Force -ErrorAction SilentlyContinue
  Stop-And-Restore $_.Exception.Message "d1-local"
} finally {
  Remove-Item -LiteralPath $tempPersist -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "`n=== PRODUCTION BUILD ===" -ForegroundColor Cyan
pnpm build
if ($LASTEXITCODE -ne 0) { Stop-And-Restore "pnpm build failed" "build" }

Write-Host "`n=== COMMIT + PUSH ===" -ForegroundColor Cyan
$changedAfter = @(git diff --name-only)
if ($changedAfter.Count -eq 0) {
  Write-Host "Integration already committed; no new commit required." -ForegroundColor Yellow
} else {
  git add -- $rolloutTouched
  git commit -m "fix(workforce): restore employee-owned weekly rest and payroll UX parity"
  if ($LASTEXITCODE -ne 0) { Stop-And-Restore "git commit failed" "commit" }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw "git push failed; local commit preserved for retry" }
}

Write-Host "`n=== FINAL ===" -ForegroundColor Cyan
$finalDirty = @(git status --porcelain=v1 --untracked-files=all)
if ($finalDirty.Count -gt 0) {
  $finalDirty
  throw "STOP: final working tree is not clean."
}

git branch --show-current
git rev-parse HEAD
Write-Host "`nPASS - employee-owned weekly rest, template-only shifts, generic Workforce resolver bridge, payroll order, contracts, local D1 0001..0005, TypeScript and build are green." -ForegroundColor Green
Write-Host "NO production D1 migration or Worker/Pages deployment was performed." -ForegroundColor Yellow
