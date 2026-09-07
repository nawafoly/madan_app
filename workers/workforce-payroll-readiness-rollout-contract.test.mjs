import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rollout = fs.readFileSync(new URL("../scripts/deploy-workforce-payroll-readiness-production.ps1", import.meta.url), "utf8");

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

test("readiness rollout stages only the two integration targets", () => {
  assert.ok(rollout.includes("client/src/features/workforce/WorkforceEmployeeFile.tsx"));
  assert.ok(rollout.includes("workers/workforce-core.js"));
  assert.equal(rollout.includes("workers/habat-workforce-adapter.js"), false);
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
