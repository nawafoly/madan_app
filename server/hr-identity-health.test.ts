import { describe, expect, it } from "vitest";
import { mapIdentityIntegrityHealth } from "../workers/hr-identity-health.js";

describe("HR identity health mapping", () => {
  it("reports clean when all six deployed identity counters are zero", () => {
    expect(
      mapIdentityIntegrityHealth({
        staff_profile_without_employee: 0,
        broken_linked_employee_id: 0,
        link_auth_mismatch: 0,
        employee_without_auth_uid: 0,
        employee_without_account: 0,
        reverse_link_mismatch: 0,
      })
    ).toEqual({
      ok: true,
      counts: {
        staff_profile_without_employee: 0,
        broken_linked_employee_id: 0,
        link_auth_mismatch: 0,
        employee_without_auth_uid: 0,
        employee_without_account: 0,
        reverse_link_mismatch: 0,
      },
    });
  });

  it("reports drift when any deployed identity counter is nonzero", () => {
    const result = mapIdentityIntegrityHealth({
      staff_profile_without_employee: 0,
      broken_linked_employee_id: 1,
      link_auth_mismatch: 0,
      employee_without_auth_uid: 0,
      employee_without_account: 0,
      reverse_link_mismatch: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.counts.broken_linked_employee_id).toBe(1);
  });
});
