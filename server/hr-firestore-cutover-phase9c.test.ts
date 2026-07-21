import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeLeaveBalanceAdjustmentPayload,
} from "../workers/hr-core-worker.js";

const root = path.resolve(__dirname, "..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("HR Firestore cutover phase 9C", () => {
  it("accepts valid leave balance adjustments", () => {
    expect(
      normalizeLeaveBalanceAdjustmentPayload({
        value: 12,
        operationType: "add",
        reason: "Annual balance correction",
      })
    ).toMatchObject({
      ok: true,
      value: {
        amount: 12,
        operationType: "add",
      },
    });
  });

  it("rejects invalid deductions and missing reasons", () => {
    expect(
      normalizeLeaveBalanceAdjustmentPayload({
        value: 0,
        operationType: "deduct",
        reason: "test",
      })
    ).toMatchObject({ ok: false });

    expect(
      normalizeLeaveBalanceAdjustmentPayload({
        value: 2,
        operationType: "deduct",
        reason: "",
      })
    ).toMatchObject({ ok: false });
  });

  it("removes Firestore from admin employee management", () => {
    const source = read("client/src/pages/admin/Employees.tsx");
    expect(source).not.toContain("firebase/firestore");
    expect(source).not.toContain("HR_CORE_D1_ENABLED");
    expect(source).not.toContain("isHrCoreConfigured");
    expect(source).not.toContain("messageRef.id");
    expect(source).not.toMatch(
      /\b(collection|doc|getDocs|onSnapshot|query|runTransaction|setDoc|writeBatch|serverTimestamp)\s*\(/
    );
    expect(source).toContain("listHrCoreLeaveBalanceAdjustments");
    expect(source).toContain("adjustHrCoreEmployeeLeaveBalance");
  });

  it("exposes the D1 adjustment endpoints and release", () => {
    const api = read("client/src/lib/hrCoreApi.ts");
    const worker = read("workers/hr-core-worker.js");
    const migration = read(
      "workers/hr-migrations/0007_employee_leave_balance_adjustments.sql"
    );

    expect(api).toContain("listHrCoreLeaveBalanceAdjustments");
    expect(api).toContain("adjustHrCoreEmployeeLeaveBalance");
    expect(worker).toContain("phase9c-employee-admin-cutover-v1");
    expect(worker).toContain("/api/hr/leave-balance-adjustments");
    expect(worker).toContain("adjustEmployeeLeaveBalance");
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS employee_leave_balance_adjustments"
    );
  });
});
