import { describe, expect, it } from "vitest";
import {
  buildPayrollInsertStatement,
  computeEffectivePermissions,
  computeLeaveCancellationState,
  computePayrollFinancialTotals,
  isPayrollImportPath,
  normalizeEmployeePayload,
  normalizeImportedAbsence,
  normalizeImportedLeaveRequest,
  normalizeImportedPayrollRecord,
  normalizeImportedServiceRequest,
  validateFirebaseTokenClaims,
} from "../workers/hr-core-worker.js";

describe("HR Core permission resolution", () => {
  it("applies allow overrides and removes denied permissions", () => {
    expect(
      computeEffectivePermissions(
        ["employees.view", "attendance.view"],
        [
          { permission_key: "employees.manage", effect: "allow" },
          { permission_key: "attendance.view", effect: "deny" },
        ]
      )
    ).toEqual(["employees.manage", "employees.view"]);
  });

  it("keeps deny authoritative when duplicate overrides are supplied", () => {
    expect(
      computeEffectivePermissions(["employees.view"], [
        { permission_key: "employees.view", effect: "deny" },
        { permission_key: "employees.view", effect: "allow" },
      ])
    ).toEqual([]);
  });
});

describe("Firebase transition token claims", () => {
  const header = { alg: "RS256", kid: "test-key" };
  const payload = {
    aud: "index-599e8",
    iss: "https://securetoken.google.com/index-599e8",
    sub: "employee-uid",
    exp: 2_000,
    iat: 1_000,
    auth_time: 900,
  };

  it("accepts valid Firebase ID token claims", () => {
    expect(
      validateFirebaseTokenClaims(header, payload, "index-599e8", 1_500)
    ).toBe(true);
  });

  it("rejects tokens issued for a different Firebase project", () => {
    expect(() =>
      validateFirebaseTokenClaims(header, payload, "other-project", 1_500)
    ).toThrow("firebase_audience_invalid");
  });

  it("rejects expired tokens", () => {
    expect(() =>
      validateFirebaseTokenClaims(header, payload, "index-599e8", 2_001)
    ).toThrow("firebase_token_expired");
  });
});

describe("HR employee normalization", () => {
  it("normalizes the existing nested Firestore employee profile", () => {
    const result = normalizeEmployeePayload(
      {
        id: "employee-1",
        uid: "auth-1",
        employeeProfile: {
          personal: {
            name: "موظفة تجريبية",
            email: "TEST@EXAMPLE.COM",
            phone: "0500000000",
            avatar: { fileUrl: "https://example.com/avatar.png" },
          },
          employment: {
            title: "مسؤولة موارد بشرية",
            department: "HR",
            employmentStatus: "active",
            leaveBalance: "12",
            baseSalary: "5000",
            workSchedule: {
              startTime: "09:00",
              endTime: "17:00",
              weeklyOffDays: ["friday", "saturday"],
            },
            allowedZoneIds: ["office"],
          },
        },
      },
      { partial: false }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: "employee-1",
      authUid: "auth-1",
      name: "موظفة تجريبية",
      email: "test@example.com",
      phone: "0500000000",
      title: "مسؤولة موارد بشرية",
      department: "HR",
      employmentStatus: "active",
      isActive: true,
      leaveBalance: 12,
      baseSalary: 5000,
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      weeklyOffDays: ["friday", "saturday"],
      allowedZoneIds: ["office"],
    });
  });

  it("does not overwrite omitted fields in partial updates", () => {
    const result = normalizeEmployeePayload(
      { department: "Operations", isActive: false },
      { partial: true }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      department: "Operations",
      isActive: false,
    });
  });

  it("requires a name for full employee creation", () => {
    const result = normalizeEmployeePayload(
      { email: "missing-name@example.com" },
      { partial: false }
    );
    expect(result.ok).toBe(false);
  });
});


describe("HR operations normalization", () => {
  it("normalizes imported leave requests and preserves partial cancellations", () => {
    expect(
      normalizeImportedLeaveRequest({
        id: "leave-1",
        employeeUid: "auth-1",
        employeeDocId: "employee-1",
        status: "approved",
        leaveType: "annual",
        startDate: "2026-07-20",
        endDate: "2026-07-22",
        daysCount: 3,
        balanceDeductedDays: 3,
        balanceRestoredDays: 1,
        cancelledDateKeys: ["2026-07-21"],
      })
    ).toMatchObject({
      id: "leave-1",
      employeeId: "employee-1",
      employeeUid: "auth-1",
      status: "approved",
      daysCount: 3,
      cancelledDateKeys: ["2026-07-21"],
    });
  });

  it("accepts Firestore ISO timestamps for leave dates", () => {
    expect(
      normalizeImportedLeaveRequest({
        id: "leave-firestore-date",
        employeeUid: "auth-1",
        employeeDocId: "employee-1",
        status: "approved",
        leaveType: "annual",
        startDate: "2026-07-20T00:00:00.000Z",
        endDate: "2026-07-22T00:00:00.000Z",
      })
    ).toMatchObject({
      startDate: "2026-07-20",
      endDate: "2026-07-22",
      daysCount: 3,
    });
  });

  it("computes one-day leave cancellation without cancelling the whole range", () => {
    expect(
      computeLeaveCancellationState(
        {
          start_date: "2026-07-20",
          end_date: "2026-07-22",
          cancelled_date_keys_json: "[]",
          balance_deducted_days: 3,
          balance_restored_days: 0,
        },
        "2026-07-21"
      )
    ).toEqual({
      cancelledDateKeys: ["2026-07-21"],
      activeDateKeys: ["2026-07-20", "2026-07-22"],
      status: "approved",
      restoreDays: 1,
      balanceRestoredDays: 1,
    });
  });

  it("fully cancels the request after the final active day is removed", () => {
    expect(
      computeLeaveCancellationState(
        {
          start_date: "2026-07-20",
          end_date: "2026-07-21",
          cancelled_date_keys_json: '["2026-07-20"]',
          balance_deducted_days: 2,
          balance_restored_days: 1,
        },
        "2026-07-21"
      )
    ).toMatchObject({
      status: "cancelled",
      restoreDays: 1,
      balanceRestoredDays: 2,
    });
  });

  it("normalizes absences and rejects invalid absence dates", () => {
    expect(
      normalizeImportedAbsence({
        id: "absence-1",
        employeeUid: "auth-1",
        employeeId: "employee-1",
        date: "2026-07-21",
        type: "half_day",
      })
    ).toMatchObject({
      id: "absence-1",
      date: "2026-07-21",
      type: "half_day",
    });
    expect(
      normalizeImportedAbsence({
        id: "absence-2",
        employeeUid: "auth-1",
        date: "2026-02-31",
        type: "full_day",
      })
    ).toBeNull();
  });

  it("normalizes employee service requests", () => {
    expect(
      normalizeImportedServiceRequest({
        id: "request-1",
        employeeUid: "auth-1",
        employeeId: "employee-1",
        requestType: "salary_advance",
        status: "pending",
        amount: 500,
      })
    ).toMatchObject({
      id: "request-1",
      employeeUid: "auth-1",
      employeeId: "employee-1",
      requestType: "salary_advance",
      amount: 500,
    });
  });
});


describe("HR payroll normalization", () => {
  it("normalizes Firestore payroll records for D1", () => {
    expect(
      normalizeImportedPayrollRecord({
        id: "employee-1__2026-07",
        employeeId: "employee-1",
        employeeUid: "auth-1",
        payrollMonth: "2026-07",
        monthStart: "2026-07-01T00:00:00.000Z",
        monthEnd: "2026-07-31T00:00:00.000Z",
        baseSalary: 5000,
        allowances: 500,
        attendanceAbsenceDeduction: 200,
        absenceDeduction: 300,
        delayDeduction: 100,
        overtimeBonus: 250,
        insuranceDeduction: 450,
        salaryDeductions: [{ title: "خصم", amount: 50 }],
        finalSalary: 4650,
      })
    ).toMatchObject({
      id: "employee-1__2026-07",
      employeeId: "employee-1",
      employeeUid: "auth-1",
      payrollMonth: "2026-07",
      monthStart: "2026-07-01",
      monthEnd: "2026-07-31",
      baseSalary: 5000,
      salaryDeductions: [{ id: "deduction-1", title: "خصم", amount: 50 }],
      finalSalary: 4650,
      attendanceSource: "cloudflare_attendance",
    });
  });

  it("rejects payroll records without a valid month", () => {
    expect(
      normalizeImportedPayrollRecord({
        id: "payroll-invalid",
        employeeUid: "auth-1",
        payrollMonth: "2026-13",
        monthStart: "2026-01-01",
        monthEnd: "2026-01-31",
      })
    ).toBeNull();
  });
});


it("computes payroll totals with salary advances without double-counting attendance absence", () => {
  expect(
    computePayrollFinancialTotals({
      baseSalary: 5000,
      allowances: 500,
      overtimeBonus: 250,
      delayDeduction: 100,
      attendanceAbsenceDeduction: 200,
      absenceDeduction: 300,
      insuranceDeduction: 450,
      manualSalaryDeductions: 50,
      salaryAdvanceDeduction: 600,
    })
  ).toEqual({
    manualAbsenceDeduction: 100,
    totalSalaryDeductions: 650,
    grossSalary: 5450,
    finalSalary: 4250,
  });
});

it("builds a payroll insert with matching SQL placeholders", () => {
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          expect(args).toHaveLength((sql.match(/\?/g) || []).length);
          return { sql, args };
        },
      };
    },
  };
  expect(
    buildPayrollInsertStatement(
      db,
      {
        id: "payroll-1",
        employeeId: "employee-1",
        employeeUid: "auth-1",
        payrollMonth: "2026-07",
        monthStart: "2026-07-01",
        monthEnd: "2026-07-31",
        calculationStartDate: "2026-07-01",
        calculationEndDate: "2026-07-31",
        baseSalary: 5000,
        allowances: 500,
        absenceDays: 0,
        absenceDeduction: 0,
        attendanceSource: "cloudflare_attendance",
        attendanceSummary: {},
        scheduleSnapshot: {},
        delayDeduction: 0,
        overtimeBonus: 0,
        insuranceDeduction: 0,
        salaryDeductions: [],
        salaryAdvanceDeduction: 0,
        salaryAdvanceRequestIds: [],
        totalSalaryDeductions: 0,
        absenceEntries: [],
        grossSalary: 5500,
        finalSalary: 5500,
        status: "finalized",
      },
      "2026-07-21T00:00:00.000Z",
      "owner-1",
      "owner@example.com"
    )
  ).toBeTruthy();
});


describe("HR payroll import routing", () => {
  it("recognizes the canonical route and compatibility aliases", () => {
    expect(isPayrollImportPath("/internal/hr/payroll/import")).toBe(true);
    expect(isPayrollImportPath("/internal/hr/payroll/import/")).toBe(true);
    expect(isPayrollImportPath("/internal/hr/payroll-import")).toBe(true);
    expect(isPayrollImportPath("/internal/hr/import/payroll")).toBe(true);
    expect(isPayrollImportPath("/internal/hr/operations/import")).toBe(false);
  });
});
