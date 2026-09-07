import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rollout = fs.readFileSync(new URL("../scripts/deploy-workforce-payroll-adjustments-production.ps1", import.meta.url), "utf8");
const reporter = fs.readFileSync(new URL("../scripts/report-workforce-payroll-adjustments-production-schema.mjs", import.meta.url), "utf8");

test("payroll rollout gates before schema migration and Worker deploy", () => {
  const gate = rollout.indexOf("gate-workforce-payroll-adjustments-phase2.mjs");
  const migration = rollout.indexOf("0004_workforce_manual_payroll_adjustments.sql");
  const deploy = rollout.indexOf("wrangler deploy");
  assert.ok(gate >= 0 && migration > gate && deploy > migration);
});

test("payroll rollout targets only migration 0004 and never force-cleans user work", () => {
  assert.ok(rollout.includes("0004_workforce_manual_payroll_adjustments.sql"));
  assert.equal(/000[0-35-9]_workforce/i.test(rollout), false);
  assert.equal(/git\s+(?:reset|clean|checkout\s+--|restore\s+--staged)/i.test(rollout), false);
  assert.equal(/--force|-f\s+origin/i.test(rollout), false);
});

test("payroll rollout requires read-only preflight and exact postflight", () => {
  assert.ok(rollout.includes("report-workforce-payroll-adjustments-production-schema.mjs"));
  assert.ok(rollout.includes("--expect=0"));
  assert.ok(rollout.includes("--expect=1"));
  assert.ok(reporter.includes("SELECT COUNT(*) AS value"));
  assert.ok(reporter.includes("non-read-only SQL blocked"));
});

test("payroll rollout has auth-bound smoke plus regressions", () => {
  for (const required of [
    "payroll-adjustments?month=2026-09",
    "attendance-operations?month=2026-09",
    "schedule/resolve?date=2026-09-07",
    "missing_firebase_id_token",
  ]) {
    assert.ok(rollout.includes(required), required);
  }
});

test("payroll rollout stages only integration targets and is ASCII-safe for Windows PowerShell 5.1", () => {
  for (const required of [
    "client/src/features/workforce/WorkforceEmployeeFile.tsx",
    "workers/workforce-core.js",
    "workers/workforce-payroll-adjustments.js",
  ]) {
    assert.ok(rollout.includes(required), required);
  }
  assert.equal(/[^\x00-\x7F]/.test(rollout), false);
});
