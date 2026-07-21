import { describe, expect, it } from "vitest";
import {
  computeEffectivePermissions,
  computeLeaveCancellationState,
  normalizeEmployeePayload,
  normalizeImportedAbsence,
  normalizeImportedLeaveRequest,
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
