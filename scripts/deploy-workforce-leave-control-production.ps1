$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Run-Step {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][scriptblock]$Command
  )
  Write-Host "`n[workforce-leave-control-rollout] $Label" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed ($LASTEXITCODE): $Label"
  }
}

$expectedBranch = 'feat/restaurant-workforce-core-phase2'
$branch = (git branch --show-current).Trim()
if ($branch -ne $expectedBranch) {
  throw "Wrong branch: $branch. Expected: $expectedBranch"
}

Run-Step 'pull latest branch' { git pull --ff-only origin $expectedBranch }
Run-Step 'local leave-control gate' { node scripts/gate-workforce-leave-control-phase2.mjs }

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
  Run-Step 'stage leave-control integration only' {
    git add -- client/src/features/workforce/WorkforceEmployeeFile.tsx workers/workforce-core.js
  }
  Run-Step 'commit leave-control integration' {
    git commit -m 'feat(workforce): integrate resolver-backed leave usage and reversal'
  }
  Run-Step 'push leave-control integration' {
    git push origin $expectedBranch
  }
} else {
  Write-Host '[workforce-leave-control-rollout] integration already committed; continuing.' -ForegroundColor DarkGray
}

Run-Step 'deploy Worker upload' {
  npx wrangler deploy --config workers/wrangler.toml
}

$smokeBody = Join-Path $env:TEMP ("workforce-leave-control-smoke-" + [guid]::NewGuid().ToString('N') + '.json')
try {
  Write-Host "`n[workforce-leave-control-rollout] unauthenticated leave route smoke" -ForegroundColor Cyan
  $status = (& curl.exe -sS -o $smokeBody -w '%{http_code}' 'https://upload.maedin2026.workers.dev/attendance/habat/workforce/v1/employees/smoke-test/leaves').Trim()
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

Write-Host "`n[workforce-leave-control-rollout] PASS - leave usage/reversal integrated, committed, deployed, and smoke-verified." -ForegroundColor Green
