import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeEmployeeSelfServicePayload } from "../workers/hr-core-worker.js";

function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("HR Phase 9B employee self-service validation", () => {
  it("allows only phone and avatar URL updates", () => {
    expect(
      normalizeEmployeeSelfServicePayload({
        phone: "0500000000",
        avatarUrl: "https://example.com/avatar.png",
      })
    ).toEqual({
      ok: true,
      value: {
        phone: "0500000000",
        avatarUrl: "https://example.com/avatar.png",
      },
    });
  });

  it("rejects privileged employee fields", () => {
    expect(
      normalizeEmployeeSelfServicePayload({
        phone: "0500000000",
        baseSalary: 9000,
      })
    ).toMatchObject({
      ok: false,
      message: "employee_self_service_fields_forbidden",
      unknown: ["baseSalary"],
    });
  });

  it("rejects invalid phone and avatar values", () => {
    expect(normalizeEmployeeSelfServicePayload({ phone: "123" })).toMatchObject({
      ok: false,
      message: "employee_phone_invalid",
    });
    expect(
      normalizeEmployeeSelfServicePayload({ avatarUrl: "javascript:alert(1)" })
    ).toMatchObject({
      ok: false,
      message: "employee_avatar_url_invalid",
    });
  });
});

describe("HR Phase 9B Firestore cutover", () => {
  it("keeps the employee profile D1-only", () => {
    const source = read("client/src/pages/employee/Profile.tsx");
    expect(source).not.toContain("firebase/firestore");
    expect(source).not.toContain("HR_CORE_D1_ENABLED");
    expect(source).not.toContain("onSnapshot(");
    expect(source).not.toContain("setDoc(");
    expect(source).not.toContain("addDoc(");
    expect(source).toContain("getHrCoreEmployee");
    expect(source).toContain("updateHrCoreEmployee");
  });

  it("loads the attendance directory without Firestore", () => {
    const source = read("client/src/pages/hr/Attendance.tsx");
    expect(source).not.toContain("firebase/firestore");
    expect(source).not.toContain("getDocs(");
    expect(source).toContain("fetchEmployeeDirectoryFromWorker");
  });

  it("loads staff portal badges from HR Core", () => {
    const source = read("client/src/pages/hr/StaffPortal.tsx");
    expect(source).not.toContain("firebase/firestore");
    expect(source).not.toContain("onSnapshot(");
    expect(source).toContain("listHrCoreWeeklyReports");
  });

  it("routes employee directory reads through HR Core D1", () => {
    const client = read("client/src/lib/employeeDirectoryWorker.ts");
    const api = read("client/src/lib/hrCoreApi.ts");
    const worker = read("workers/hr-core-worker.js");

    expect(client).not.toContain("/listActiveEmployeeDirectory");
    expect(client).toContain("listHrCoreEmployeeDirectory");
    expect(api).toContain("/api/hr/employee-directory");
    expect(worker).toContain('pathname === "/api/hr/employee-directory"');
    expect(worker).toContain("updateOwnEmployeeProfile");
    expect(worker).toContain('phase9d-d1-login-identity-v1');
  });
});
