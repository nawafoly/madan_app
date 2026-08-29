import { describe, expect, it } from "vitest";
import {
  resolveNextAccountIdentityState,
  validateAccountIdentityMutation,
} from "../workers/hr-account-identity-validation.js";

describe("HR account identity mutation validation", () => {
  const before = {
    uid: "u1",
    role_key: "staff",
    employee_profile_enabled: 1,
    linked_employee_id: "e1",
  };
  const linkedEmployee = { id: "e1", auth_uid: "u1" };

  it("accepts a non-identity account patch when the existing link is coherent", () => {
    expect(
      validateAccountIdentityMutation({
        uid: "u1",
        before,
        patch: { displayName: "Updated" },
        linkedEmployee,
        employeeByAuthUid: linkedEmployee,
      })
    ).toMatchObject({ ok: true });
  });

  it("rejects linking an account to a missing employee", () => {
    expect(
      validateAccountIdentityMutation({
        uid: "u1",
        before,
        patch: { linkedEmployeeId: "missing" },
        linkedEmployee: null,
        employeeByAuthUid: null,
      })
    ).toMatchObject({
      ok: false,
      status: 409,
      message: "identity_linked_employee_not_found",
    });
  });

  it("rejects linking an account to an employee owned by another auth uid", () => {
    expect(
      validateAccountIdentityMutation({
        uid: "u1",
        before,
        patch: { linkedEmployeeId: "e2" },
        linkedEmployee: { id: "e2", auth_uid: "u2" },
        employeeByAuthUid: null,
      })
    ).toMatchObject({
      ok: false,
      status: 409,
      message: "identity_linked_employee_auth_mismatch",
    });
  });

  it("rejects unlinking an account while an employee still owns the auth uid", () => {
    expect(
      validateAccountIdentityMutation({
        uid: "u1",
        before,
        patch: { linkedEmployeeId: null },
        linkedEmployee: null,
        employeeByAuthUid: linkedEmployee,
      })
    ).toMatchObject({
      ok: false,
      status: 409,
      message: "identity_account_employee_unlink_forbidden",
    });
  });

  it("rejects disabling the employee profile while the employee remains linked", () => {
    expect(
      validateAccountIdentityMutation({
        uid: "u1",
        before,
        patch: { employeeProfileEnabled: false },
        linkedEmployee,
        employeeByAuthUid: linkedEmployee,
      })
    ).toMatchObject({
      ok: false,
      status: 409,
      message: "identity_employee_profile_disable_forbidden",
    });
  });

  it("requires a link when a profile-enabled staff account has no employee", () => {
    expect(
      validateAccountIdentityMutation({
        uid: "u1",
        before: {
          uid: "u1",
          role_key: "staff",
          employee_profile_enabled: 0,
          linked_employee_id: null,
        },
        patch: { employeeProfileEnabled: true },
        linkedEmployee: null,
        employeeByAuthUid: null,
      })
    ).toMatchObject({
      ok: false,
      status: 409,
      message: "identity_account_employee_link_required",
    });
  });

  it("resolves the next identity state from partial patches", () => {
    expect(
      resolveNextAccountIdentityState({
        before,
        patch: { role: "HR" },
      })
    ).toEqual({
      role: "hr",
      employeeProfileEnabled: true,
      linkedEmployeeId: "e1",
    });
  });
});
