import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rollout = fs.readFileSync(new URL("../scripts/deploy-workforce-payroll-readiness-production.ps1", import.meta.url), "utf8");
const integration = fs.readFileSync(new URL("../scripts/integrate-workforce-payroll-readiness.mjs", import.meta.url), "utf8");

test("readiness rollout gates before commit and Worker deploy", () => {
  const gate = rollout.indexOf("gate-workforce-payroll-readiness-phase2.mjs");
  const commit = rollout.indexOf("commit readiness integration");
  const deploy = rollout.indexOf("wrangler deploy");
  assert.ok(gate >= 0 && commit > gate && deploy > commit);
});

test("readiness rollout performs no Production D1 migration", () => {
  assert.equal(/d1\s+execute|--remote|workforce-migrations/i.test(rollout), false);
});

test("readiness rollout never resets or force-cleans user work", () => {
  assert.equal(/git\s+(?:reset|clean|checkout\s+--|restore\s+--staged)/i.test(rollout), false);
  assert.equal(/--force|-f\s+origin/i.test(rollout), false);
});

test("readiness rollout stages only approved readiness integration targets", () => {
  for (const required of [
    "client/src/features/workforce/WorkforceEmployeeFile.tsx",
    "workers/workforce-core.js",
    "workers/workforce-payroll-adjustments.js",
  ]) {
    assert.ok(rollout.includes(required), required);
  }
  assert.equal(rollout.includes("workers/habat-workforce-adapter.js"), false);
});

test("readiness integration restores the shared clean helper if a compatibility edit removed it", () => {
  assert.ok(integration.includes("payrollAdjustmentsPath"));
  assert.ok(integration.includes("function clean(value)"));
  assert.ok(integration.includes("payroll adjustments clean helper"));
});

test("readiness rollout smoke-protects payroll plus upstream regressions", () => {
  for (const required of [
    "payroll-readiness?month=2026-09",
    "payroll-adjustments?month=2026-09",
    "attendance-operations?month=2026-09",
    "smoke-test/leaves",
    "schedule/resolve?date=2026-09-07",
    "missing_firebase_id_token",
  ]) {
    assert.ok(rollout.includes(required), required);
  }
});

test("readiness rollout stays ASCII-safe for Windows PowerShell 5.1", () => {
  assert.equal(/[^\x00-\x7F]/.test(rollout), false);
});
