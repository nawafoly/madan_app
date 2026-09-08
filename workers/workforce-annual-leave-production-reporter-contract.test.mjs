import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const reporter = fs.readFileSync(
  new URL("../scripts/report-workforce-annual-leave-production-schema.mjs", import.meta.url),
  "utf8"
);

test("annual leave production schema reporter is remote but SELECT-only", () => {
  assert.ok(reporter.includes('"--remote"'));
  assert.ok(reporter.includes("pragma_table_info"));
  assert.ok(reporter.includes("every value must be 0"));
  assert.ok(reporter.includes("every value must be 1"));
  assert.equal(reporter.includes("--file"), false);
  assert.equal(/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|ATTACH|DETACH|REINDEX)\b/.test(
    reporter.replace(/const forbidden =[^;]+;/s, "")
  ), false);
});

test("annual leave production schema reporter checks all 11 migration columns", () => {
  for (const column of [
    "annual_leave_contract_days",
    "annual_leave_accrual_mode",
    "balance_days",
    "review_status",
    "review_reason",
    "delta_days",
    "balance_before_days",
    "balance_after_days",
    "entry_code",
    "metadata_json",
    "deleted_at",
  ]) {
    assert.ok(reporter.includes(column), column);
  }
});
