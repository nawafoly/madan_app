import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rollout = fs.readFileSync(new URL("../scripts/deploy-workforce-payroll-reports-production.ps1", import.meta.url), "utf8");

test("payroll reports rollout gates before commit and Worker deploy", () => {
  const gate = rollout.indexOf("gate-workforce-payroll-reports-phase2.mjs");
  const commit = rollout.indexOf("commit payroll reports integration");
  const deploy = rollout.indexOf("wrangler deploy");
  assert.ok(gate >= 0 && commit > gate && deploy > commit);
});

test("payroll reports rollout performs no Production D1 migration", () => {
  assert.equal(/d1\s+execute|--remote|workforce-migrations/i.test(rollout), false);
});

test("payroll reports rollout never resets or force-cleans user work", () => {
  assert.equal(/git\s+(?:reset|clean|checkout\s+--|restore\s+--staged)/i.test(rollout), false);
  assert.equal(/--force|-f\s+origin/i.test(rollout), false);
});

test("payroll reports rollout stages only approved integration targets", () => {
  for (const path of [
    "client/src/features/workforce/WorkforceEmployeeFile.tsx",
    "client/src/pages/habat/HabatAttendanceAppV4.tsx",
    "workers/workforce-core.js",
  ]) assert.ok(rollout.includes(path), path);
});

test("payroll reports rollout smoke-protects both report routes and payroll regressions", () => {
  for (const required of [
    "monthly-payroll-report?month=2026-09",
    "payroll/reports/monthly?month=2026-09",
    "payroll-lifecycle?month=2026-09",
    "payroll-readiness?month=2026-09",
    "payroll-adjustments?month=2026-09",
    "attendance-operations?month=2026-09",
    "smoke-test/leaves",
    "schedule/resolve?date=2026-09-07",
    "missing_firebase_id_token",
  ]) assert.ok(rollout.includes(required), required);
});

test("payroll reports rollout stays ASCII-safe for Windows PowerShell 5.1", () => {
  assert.equal(/[^\x00-\x7F]/.test(rollout), false);
});
