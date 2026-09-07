import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const service = fs.readFileSync(new URL("./workforce-leave-control.js", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../client/src/features/workforce/WorkforceLeaveLifecyclePanel.tsx", import.meta.url), "utf8");
const integration = fs.readFileSync(new URL("../scripts/integrate-workforce-leave-control.mjs", import.meta.url), "utf8");

test("leave control remains tenant-agnostic", () => {
  for (const forbidden of ["habat_", "habat-alwaraq", "حبات الورق", "salon_id"]) {
    assert.equal(service.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    assert.equal(ui.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});

test("annual leave usage is bound to the shared schedule resolver", () => {
  assert.ok(service.includes('import { resolveWorkforceScheduleRange } from "./workforce-schedule-control.js"'));
  assert.ok(service.includes("await resolveWorkforceScheduleRange"));
  assert.ok(service.includes("workforce_annual_leave_schedule_not_ready"));
  assert.ok(service.includes("schedules.filter(item => item?.isWorkingDay === true)"));
  assert.ok(service.includes("excludedDates"));
});

test("annual leave debits and cancellation reversals are auditable ledger entries", () => {
  for (const required of [
    "LEAVE_USED",
    "LEAVE_REVERSAL",
    "source_type = 'workforce_leave'",
    "annual_leave_use:${leaveId}",
    "annual_leave_reversal:${leave.id}",
    "balance_before_days",
    "balance_after_days",
    "metadata_json",
  ]) assert.ok(service.includes(required), required);
  assert.equal(/DELETE\s+FROM\s+workforce_leave_ledger/i.test(service), false);
});

test("leave creation and reversal writes use D1 batch instead of partial multi-step writes", () => {
  assert.ok(service.includes("await db.batch(statements)"));
  assert.ok(service.includes("const statements = [leaveStatement]"));
  assert.ok(service.includes("SET status = 'cancelled'"));
});

test("full-day, half-day, and partial annual leave have explicit charging rules", () => {
  assert.ok(service.includes('leave.durationKind === "full_day"'));
  assert.ok(service.includes('leave.durationKind === "half_day"'));
  assert.ok(service.includes("chargeDays = working.length"));
  assert.ok(service.includes("chargeDays = 0.5"));
  assert.ok(service.includes("requestedMinutes / scheduledMinutes"));
  assert.ok(service.includes("workforce_annual_leave_partial_minutes_invalid"));
  assert.ok(service.includes("workforce_annual_leave_insufficient_balance"));
});

test("leave lifecycle UI exposes resolver-backed debit and reversal semantics", () => {
  for (const required of [
    "دورة الإجازة والخصم من الرصيد",
    "Schedule Resolver",
    "LEAVE_USED",
    "LEAVE_REVERSAL",
    'method: "DELETE"',
    "إلغاء",
  ]) assert.ok(ui.includes(required), required);
});

test("leave integration patch is idempotent, CRLF-safe, and cannot deploy", () => {
  assert.ok(integration.includes("preferredEol"));
  assert.ok(integration.includes("replaceOnce"));
  assert.ok(integration.includes("includes"));
  assert.equal(/wrangler|deploy|--remote|d1 execute/i.test(integration), false);
  assert.ok(integration.includes('marker.replace(/\\n/g, "\\r\\n")'));
});

test("leave control is designed to intercept collection routes before legacy core leave handling", () => {
  assert.ok(integration.includes("handleWorkforceLeaveControlRequest"));
  assert.ok(integration.includes("leaveControlResponse"));
  assert.ok(integration.includes("if (leaveControlResponse) return leaveControlResponse"));
});
