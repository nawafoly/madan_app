import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const reporter = fs.readFileSync(new URL("../scripts/report-workforce-schedule-production-schema.mjs", import.meta.url), "utf8");

test("schedule production schema reporter is remote but hard-blocked to SELECT-only", () => {
  assert.ok(reporter.includes('"--remote"'));
  assert.ok(reporter.includes("non-read-only SQL blocked"));
  assert.ok(reporter.includes("forbidden"));
  assert.equal(/--file/.test(reporter), false);
});

test("schedule production schema reporter checks all 8 columns and 3 indexes", () => {
  for (const required of [
    "schedule_status",
    "schedule_source_type",
    "schedule_source_id",
    "schedule_operation_id",
    "schedule_metadata_json",
    "schedule_cancelled_at",
    "schedule_cancelled_by_uid",
    "schedule_cancelled_by_email",
    "schedule_operation_index",
    "schedule_status_date_index",
    "schedule_source_index",
  ]) assert.ok(reporter.includes(required), required);
});
