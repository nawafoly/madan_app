import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rollout = fs.readFileSync(new URL("../scripts/deploy-workforce-leave-control-production.ps1", import.meta.url), "utf8");

test("leave-control rollout gates before Worker deploy", () => {
  const gate = rollout.indexOf("gate-workforce-leave-control-phase2.mjs");
  const commit = rollout.indexOf("commit leave-control integration");
  const deploy = rollout.indexOf("wrangler deploy");
  const smoke = rollout.indexOf("unauthenticated leave route smoke");
  assert.ok(gate >= 0 && commit > gate && deploy > commit && smoke > deploy);
});

test("leave-control rollout has no Production D1 migration step", () => {
  assert.equal(/d1\s+execute|--remote|workforce-migrations/i.test(rollout), false);
});

test("leave-control rollout never force-cleans user work", () => {
  assert.equal(/git\s+(?:reset|clean|checkout\s+--|restore\s+--source)/i.test(rollout), false);
  assert.ok(rollout.includes("Unexpected working-tree changes"));
  assert.ok(rollout.includes("WorkforceEmployeeFile.tsx"));
  assert.ok(rollout.includes("workforce-core.js"));
});

test("leave-control rollout requires expected unauthenticated smoke semantics", () => {
  assert.ok(rollout.includes("401"));
  assert.ok(rollout.includes("missing_firebase_id_token"));
  assert.ok(rollout.includes("/leaves"));
});

test("leave-control rollout stays ASCII-safe for Windows PowerShell 5.1", () => {
  assert.equal(/[^\x00-\x7F]/.test(rollout), false);
});
