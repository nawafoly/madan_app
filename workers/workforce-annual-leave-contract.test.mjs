import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  annualLeaveServiceYear,
  calculateAnnualLeaveAccrual,
  calculateAnnualLeaveAccrualRange,
} from "./workforce-annual-leave.js";

const service = fs.readFileSync(new URL("./workforce-annual-leave.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("./workforce-migrations/0002_workforce_annual_leave_ledger.sql", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../client/src/features/workforce/WorkforceAnnualLeavePanel.tsx", import.meta.url), "utf8");
const integration = fs.readFileSync(new URL("../scripts/integrate-workforce-annual-leave.mjs", import.meta.url), "utf8");

test("annual leave service remains tenant-agnostic", () => {
  for (const forbidden of ["habat_", "habat-alwaraq", "حبات الورق", "salon_id"]) {
    assert.equal(service.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    assert.equal(migration.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    assert.equal(ui.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});

test("Saudi annual entitlement is 21 days before five completed years and 30 afterwards", () => {
  const early = calculateAnnualLeaveAccrual({
    startDate: "2024-01-01",
    asOfDate: "2026-01-01",
  });
  assert.equal(early.statutoryEntitlementDays, 21);
  assert.equal(early.annualEntitlementDays, 21);

  const mature = calculateAnnualLeaveAccrual({
    startDate: "2020-01-01",
    asOfDate: "2026-01-01",
  });
  assert.equal(mature.statutoryEntitlementDays, 30);
  assert.equal(mature.annualEntitlementDays, 30);
});

test("contractual annual entitlement can exceed but never undercut the statutory floor", () => {
  const higher = calculateAnnualLeaveAccrual({
    startDate: "2024-01-01",
    asOfDate: "2026-01-01",
    contractAnnualDays: 25,
  });
  assert.equal(higher.annualEntitlementDays, 25);

  const lower = calculateAnnualLeaveAccrual({
    startDate: "2020-01-01",
    asOfDate: "2026-01-01",
    contractAnnualDays: 21,
  });
  assert.equal(lower.annualEntitlementDays, 30);
});

test("service-anniversary math handles leap-day hires", () => {
  const year = annualLeaveServiceYear("2024-02-29", "2025-02-28");
  assert.equal(year.serviceYearStart, "2025-02-28");
  assert.equal(year.serviceYearEnd, "2026-02-28");
});

test("accrual after an opening anchor starts strictly after its effective date", () => {
  const full = calculateAnnualLeaveAccrualRange({
    startDate: "2026-01-01",
    asOfDate: "2026-12-31",
  });
  const anchored = calculateAnnualLeaveAccrualRange({
    startDate: "2026-01-01",
    asOfDate: "2026-12-31",
    fromExclusiveDate: "2026-06-30",
  });
  assert.ok(full.accruedDays > anchored.accruedDays);
  assert.ok(anchored.accruedDays > 0);
});

test("annual leave schema provides canonical opening and auditable day ledger fields", () => {
  for (const required of [
    "annual_leave_contract_days",
    "annual_leave_accrual_mode",
    "balance_days",
    "delta_days",
    "balance_before_days",
    "balance_after_days",
    "entry_code",
    "OPENING_BALANCE",
    "metadata_json",
    "deleted_at",
    "idx_workforce_annual_leave_single_opening",
  ]) {
    assert.match(migration, new RegExp(required));
  }
});

test("opening balance rules are explicit in the service", () => {
  for (const required of [
    "opening_before_service_start",
    "opening_in_future",
    "opening_already_exists",
    "halfDayValue",
    "operationId",
    "OPENING_BALANCE",
  ]) {
    assert.ok(service.includes(required), required);
  }
});

test("annual leave UI exposes opening balance, manual corrections, and ledger history", () => {
  for (const required of [
    "رصيد الإجازة السنوية",
    "تثبيت الرصيد الافتتاحي",
    "تصحيح رصيد يدوي",
    "سجل حركات الرصيد",
    "serviceStartDate",
  ]) {
    assert.ok(ui.includes(required), required);
  }
});

test("annual leave integration patch is idempotent and cannot deploy or target remote D1", () => {
  assert.ok(integration.includes("includes"));
  assert.equal(integration.includes("--remote"), false);
  assert.equal(/wrangler|deploy|d1 execute/i.test(integration), false);
});
