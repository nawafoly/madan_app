import { describe, expect, it } from "vitest";
import {
  computeEffectivePermissions,
  normalizeEmployeePayload,
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
