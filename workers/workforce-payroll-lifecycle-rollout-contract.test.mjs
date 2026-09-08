import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rollout = fs.readFileSync(new URL("../scripts/deploy-workforce-payroll-lifecycle-production.ps1", import.meta.url), "utf8");

test("lifecycle rollout gates before commit and Worker deploy", () => {
  const gate = rollout.indexOf("gate-workforce-payroll-lifecycle-phase2.mjs");
  const commit = rollout.indexOf("commit lifecycle integration");
  const deploy = rollout.indexOf("wrangler deploy");
  assert.ok(gate >= 0 && commit > gate && deploy > commit);
});

test("lifecycle rollout performs no Production D1 migration", () => {
  assert.equal(/d1\s+execute|--remote|workforce-migrations/i.test(rollout), false);
});

test("lifecycle rollout never resets or force-cleans user work", () => {
  assert.equal(/git\s+(?:reset|clean|checkout\s+--|restore\s+--staged)/i.test(rollout), false);
  assert.equal(/--force|-f\s+origin/i.test(rollout), false);
});

test("lifecycle rollout stages only approved integration targets", () => {
  assert.ok(rollout.includes("client/src/features/workforce/WorkforceEmployeeFile.tsx"));
  assert.ok(rollout.includes("workers/workforce-core.js"));
  assert.equal(rollout.includes("workers/habat-workforce-adapter.js"), false);
});

test("lifecycle rollout smoke-protects lifecycle plus upstream payroll regressions", () => {
  for (const required of [
    "payroll-lifecycle?month=2026-09",
    "payroll-readiness?month=2026-09",
    "payroll-adjustments?month=2026-09",
    "attendance-operations?month=2026-09",
    "schedule/resolve?date=2026-09-07",
    "missing_firebase_id_token",
  ]) assert.ok(rollout.includes(required), required);
});

test("lifecycle rollout stays ASCII-safe for Windows PowerShell 5.1", () => {
  assert.equal(/[^\x00-\x7F]/.test(rollout), false);
});
