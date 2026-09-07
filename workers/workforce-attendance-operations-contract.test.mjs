import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const service = fs.readFileSync(new URL("./workforce-attendance-operations.js", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../client/src/features/workforce/WorkforceAttendanceOperationsPanel.tsx", import.meta.url), "utf8");
const integration = fs.readFileSync(new URL("../scripts/integrate-workforce-attendance-operations.mjs", import.meta.url), "utf8");

test("attendance operations core stays tenant-agnostic", () => {
  for (const forbidden of ["habat_", "habat-alwaraq", "حبات الورق", "salon_id"]) {
    assert.equal(service.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    assert.equal(ui.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});

test("attendance operations are source-adapter driven and readiness gated", () => {
  assert.ok(service.includes("sourceAdapter?.listAttendanceMonth"));
  assert.ok(service.includes('status: "unlinked"'));
  assert.ok(service.includes('status: "exempt"'));
  assert.ok(service.includes('linkStatus !== "confirmed"'));
  assert.ok(service.includes('status: "confirmed"'));
});

test("attendance operations expose lateness, early leave, missing punch, and explicit absence", () => {
  for (const required of [
    "lateMinutes",
    "earlyLeaveMinutes",
    "missingPunch",
    "explicitAbsence",
    "lateDays",
    "earlyLeaveDays",
    "missingPunchDays",
    "explicitAbsenceDays",
  ]) assert.ok(service.includes(required), required);
});

test("attendance operations use bounded month ranges instead of wildcard month scans", () => {
  assert.ok(service.includes("absence_date >= ? AND absence_date < ?"));
  assert.ok(service.includes("monthBounds"));
  assert.equal(service.includes("absence_date LIKE ?"), false);
  assert.ok(integration.includes("account_uid = ? AND attendance_date >= ? AND attendance_date < ?"));
  assert.ok(integration.includes("lower(account_email) = ? AND attendance_date >= ? AND attendance_date < ?"));
});

test("attendance operations never create automatic payroll deductions", () => {
  assert.equal(/INSERT\s+INTO\s+workforce_payroll/i.test(service), false);
  assert.equal(/UPDATE\s+workforce_payroll/i.test(service), false);
  assert.equal(service.includes("attendance_deduction_halalas"), false);
  assert.equal(service.includes("absence_deduction_halalas"), false);
});

test("Habbat legacy table knowledge is isolated to integration edge adapter code", () => {
  assert.ok(integration.includes("habat_attendance_access"));
  assert.ok(integration.includes("habat_attendance_records"));
  assert.ok(integration.includes("listAttendanceMonth"));
});

test("attendance operations UI explicitly communicates payroll safety", () => {
  for (const required of [
    "الحضور التشغيلي: الغياب والتأخير",
    "لا تطبق أي خصم راتب تلقائي",
    "أيام تأخير",
    "خروج مبكر",
    "بصمة ناقصة",
    "غياب معتمد",
  ]) assert.ok(ui.includes(required), required);
});

test("attendance integration patch is idempotent and CRLF-safe", () => {
  assert.ok(integration.includes("preferredEol"));
  assert.ok(integration.includes("replaceOnce"));
  assert.ok(integration.includes("includes"));
  assert.ok(integration.includes('marker.replace(/\\n/g, "\\r\\n")'));
  assert.equal(/wrangler|deploy|--remote|d1 execute/i.test(integration), false);
});
