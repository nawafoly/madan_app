import { describe, expect, it } from "vitest";

import { normalizeEmployeeProfile } from "@/lib/employeeProfile";

describe("normalizeEmployeeProfile", () => {
  it("uses the authenticated photo when the saved photo URL is blank", () => {
    const profile = normalizeEmployeeProfile(
      {
        uid: "employee-1",
        displayName: "Employee One",
        photoURL: "",
      },
      {
        displayName: "Employee One",
        email: "employee@example.com",
        photoURL: "https://example.com/employee.png",
      }
    );

    expect(profile.personal.avatarUrl).toBe("https://example.com/employee.png");
  });
});
