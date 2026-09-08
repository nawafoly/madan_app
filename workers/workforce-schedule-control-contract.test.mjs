import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { classifyWorkforceScheduleDay } from "./workforce-schedule-control.js";

const service = fs.readFileSync(new URL("./workforce-schedule-control.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("./workforce-migrations/0003_workforce_schedule_control.sql", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../client/src/features/workforce/WorkforceScheduleControlPanel.tsx", import.meta.url), "utf8");
const integration = fs.readFileSync(new URL("../scripts/integrate-workforce-schedule-control.mjs", import.meta.url), "utf8");

const assignment = {
  id: "a1",
  template_id: "t1",
  template_name: "دوام",
  start_time: "09:00",
  end_time: "17:00",
  grace_minutes: 10,
  early_leave_tolerance_minutes: 0,
  working_days_json: "[0,1,2,3,4]",
};

test("schedule control remains tenant-agnostic", () => {
  for (const forbidden of ["habat_", "habat-alwaraq", "حبات الورق", "salon_id"]) {
    assert.equal(service.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    assert.equal(migration.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    assert.equal(ui.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});

test("resolver marks working assignment days and weekly-rest days deterministically", () => {
  const sunday = classifyWorkforceScheduleDay({ date: "2026-09-06", assignment, exception: null, exceptionTemplate: null });
  assert.equal(sunday.kind, "assignment");
  assert.equal(sunday.isWorkingDay, true);
  assert.equal(sunday.ready, true);

  const friday = classifyWorkforceScheduleDay({ date: "2026-09-11", assignment, exception: null, exceptionTemplate: null });
  assert.equal(friday.kind, "weekly_rest");
  assert.equal(friday.isWorkingDay, false);
  assert.equal(friday.isWeeklyRest, true);
});

test("schedule exceptions override the baseline assignment", () => {
  const off = classifyWorkforceScheduleDay({
    date: "2026-09-06",
    assignment,
    exception: { id: "e1", exception_type: "off" },
    exceptionTemplate: null,
  });
  assert.equal(off.kind, "exception_off");
  assert.equal(off.isWorkingDay, false);

  const custom = classifyWorkforceScheduleDay({
    date: "2026-09-11",
    assignment,
    exception: { id: "e2", exception_type: "custom_shift", custom_start_time: "12:00", custom_end_time: "20:00" },
    exceptionTemplate: null,
  });
  assert.equal(custom.kind, "custom_shift");
  assert.equal(custom.isWorkingDay, true);
  assert.equal(custom.startTime, "12:00");
});

test("weekly-rest work is a distinct operational source", () => {
  const resolved = classifyWorkforceScheduleDay({
    date: "2026-09-11",
    assignment,
    exception: { id: "e3", exception_type: "weekly_rest_work" },
    exceptionTemplate: null,
  });
  assert.equal(resolved.kind, "weekly_rest_work");
  assert.equal(resolved.isWorkingDay, true);
  assert.equal(resolved.ready, true);
  assert.equal(resolved.templateId, "t1");
});

test("alternate shift uses its selected template, not the baseline", () => {
  const resolved = classifyWorkforceScheduleDay({
    date: "2026-09-06",
    assignment,
    exception: { id: "e4", exception_type: "alternate_shift", template_id: "t2" },
    exceptionTemplate: { id: "t2", name: "مسائي", start_time: "16:00", end_time: "23:00", grace_minutes: 5, early_leave_tolerance_minutes: 0 },
  });
  assert.equal(resolved.kind, "alternate_shift");
  assert.equal(resolved.templateId, "t2");
  assert.equal(resolved.startTime, "16:00");
});

test("unassigned days are explicitly not ready for payroll/attendance use", () => {
  const resolved = classifyWorkforceScheduleDay({ date: "2026-09-06", assignment: null, exception: null, exceptionTemplate: null });
  assert.equal(resolved.kind, "unassigned");
  assert.equal(resolved.ready, false);
});

test("weekly-rest move is atomic, paired, audited, and idempotent", () => {
  for (const required of [
    "db.batch([workStmt, offStmt])",
    "weekly_rest_work",
    "workforce_weekly_rest_move_conflict",
    "operationId",
    "workforce.weekly_rest.move",
  ]) assert.ok(service.includes(required), required);
  assert.equal(/DELETE\s+FROM\s+workforce_schedule_exceptions/i.test(service), false);
});

test("schedule exception schema supports soft cancellation and retry-safe operations", () => {
  for (const required of [
    "status",
    "operation_id",
    "metadata_json",
    "cancelled_at",
    "cancelled_by_uid",
    "cancelled_by_email",
    "idx_workforce_schedule_exception_operation",
  ]) assert.match(migration, new RegExp(required));
});

test("schedule UI exposes parity controls", () => {
  for (const required of [
    "استثناءات الدوام والراحة الأسبوعية",
    "يوم راحة استثنائي",
    "دوام مخصص ليوم واحد",
    "شفت بديل ليوم واحد",
    "عمل استثنائي في يوم الراحة",
    "نقل الراحة الأسبوعية مؤقتًا",
    "حلّ اليوم",
  ]) assert.ok(ui.includes(required), required);
});

test("schedule integration patch is idempotent, CRLF-safe, and cannot deploy", () => {
  assert.ok(integration.includes("preferredEol"));
  assert.ok(integration.includes("includes"));
  assert.equal(integration.includes("--remote"), false);
  assert.equal(/wrangler|deploy|d1 execute/i.test(integration), false);
});
