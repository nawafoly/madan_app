import { describe, expect, it } from "vitest";
import {
  evaluateIdentityIntegrity,
  planMissingOnlyIdentityReconciliation,
} from "../workers/hr-identity-reconciliation.js";

function account(overrides: Record<string, unknown> = {}) {
  return {
    uid: "uid-1",
    role_key: "staff",
    employee_profile_enabled: 1,
    linked_employee_id: "employee-1",
    email: "source@example.com",
    ...overrides,
  };
}

function employee(overrides: Record<string, unknown> = {}) {
  return {
    id: "employee-1",
    auth_uid: "uid-1",
    name: "Employee One",
    email: "source@example.com",
    ...overrides,
  };
}

describe("HR identity integrity evaluator", () => {
  it("reports a clean canonical identity graph", () => {
    const result = evaluateIdentityIntegrity({
      accounts: [account()],
      employees: [employee()],
    });

    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({
      staff_profile_without_employee: 0,
      broken_linked_employee_id: 0,
      link_auth_mismatch: 0,
      employee_without_auth_uid: 0,
      employee_without_account: 0,
      reverse_link_mismatch: 0,
      duplicate_account_uid: 0,
      duplicate_employee_id: 0,
      duplicate_employee_auth_uid: 0,
    });
  });

  it("detects all six deployed identity drift classes", () => {
    const result = evaluateIdentityIntegrity({
      accounts: [
        account({ uid: "uid-missing", linked_employee_id: null }),
        account({ uid: "uid-broken", linked_employee_id: "missing-id" }),
        account({
          uid: "uid-mismatch",
          linked_employee_id: "employee-mismatch",
        }),
        account({
          uid: "uid-reverse",
          linked_employee_id: "other-employee",
          employee_profile_enabled: 0,
          role_key: "client",
        }),
      ],
      employees: [
        employee({ id: "employee-mismatch", auth_uid: "other-auth" }),
        employee({ id: "employee-no-auth", auth_uid: null }),
        employee({ id: "employee-no-account", auth_uid: "uid-no-account" }),
        employee({ id: "employee-reverse", auth_uid: "uid-reverse" }),
      ],
    });

    expect(result.counts.staff_profile_without_employee).toBeGreaterThan(0);
    expect(result.counts.broken_linked_employee_id).toBeGreaterThan(0);
    expect(result.counts.link_auth_mismatch).toBeGreaterThan(0);
    expect(result.counts.employee_without_auth_uid).toBeGreaterThan(0);
    expect(result.counts.employee_without_account).toBeGreaterThan(0);
    expect(result.counts.reverse_link_mismatch).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  it("fails duplicate employee auth identities closed", () => {
    const result = evaluateIdentityIntegrity({
      accounts: [account()],
      employees: [employee(), employee({ id: "employee-2" })],
    });

    expect(result.ok).toBe(false);
    expect(result.counts.duplicate_employee_auth_uid).toBe(1);
  });
});

describe("HR missing-only identity reconciliation planner", () => {
  it("produces no actions when canonical D1 already contains the identity", () => {
    const plan = planMissingOnlyIdentityReconciliation({
      sourceAccounts: [account()],
      sourceEmployees: [employee()],
      canonicalAccounts: [account({ email: "canonical@example.com" })],
      canonicalEmployees: [employee({ email: "canonical@example.com" })],
    });

    expect(plan.blocked).toBe(false);
    expect(plan.actions).toEqual([]);
    expect(plan.summary.executableActions).toBe(0);
  });

  it("plans only a fully missing account and employee pair", () => {
    const plan = planMissingOnlyIdentityReconciliation({
      sourceAccounts: [account()],
      sourceEmployees: [employee()],
      canonicalAccounts: [],
      canonicalEmployees: [],
    });

    expect(plan.blocked).toBe(false);
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({
      type: "insert_missing_identity_pair",
      authUid: "uid-1",
      employeeId: "employee-1",
      preconditions: {
        canonicalAccountAbsent: true,
        canonicalEmployeeIdAbsent: true,
        canonicalEmployeeAuthUidAbsent: true,
      },
    });
  });

  it("never plans an overwrite for an existing canonical account", () => {
    const plan = planMissingOnlyIdentityReconciliation({
      sourceAccounts: [account()],
      sourceEmployees: [employee()],
      canonicalAccounts: [
        account({
          linked_employee_id: null,
          employee_profile_enabled: 0,
          role_key: "client",
        }),
      ],
      canonicalEmployees: [],
    });

    expect(plan.blocked).toBe(true);
    expect(plan.actions).toEqual([]);
    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "canonical_account_exists_for_missing_employee",
          authUid: "uid-1",
        }),
      ])
    );
  });

  it("stops on canonical employee auth collisions instead of choosing a record", () => {
    const plan = planMissingOnlyIdentityReconciliation({
      sourceAccounts: [account()],
      sourceEmployees: [employee()],
      canonicalAccounts: [
        account({ uid: "uid-1", linked_employee_id: "employee-other" }),
      ],
      canonicalEmployees: [
        employee({ id: "employee-other", auth_uid: "uid-1" }),
      ],
    });

    expect(plan.blocked).toBe(true);
    expect(plan.actions).toEqual([]);
    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "canonical_employee_auth_uid_collision",
          authUid: "uid-1",
          sourceEmployeeId: "employee-1",
          canonicalEmployeeId: "employee-other",
        }),
      ])
    );
  });

  it("blocks all executable actions when canonical integrity is already dirty", () => {
    const plan = planMissingOnlyIdentityReconciliation({
      sourceAccounts: [
        account(),
        account({
          uid: "uid-2",
          linked_employee_id: "employee-2",
          email: "second@example.com",
        }),
      ],
      sourceEmployees: [
        employee(),
        employee({
          id: "employee-2",
          auth_uid: "uid-2",
          email: "second@example.com",
        }),
      ],
      canonicalAccounts: [
        account({
          uid: "uid-dirty",
          linked_employee_id: "missing-employee",
        }),
      ],
      canonicalEmployees: [],
    });

    expect(plan.blocked).toBe(true);
    expect(plan.actions).toEqual([]);
    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "canonical_integrity_not_clean" }),
      ])
    );
  });

  it("is idempotent after the planned missing pair exists canonically", () => {
    const first = planMissingOnlyIdentityReconciliation({
      sourceAccounts: [account()],
      sourceEmployees: [employee()],
      canonicalAccounts: [],
      canonicalEmployees: [],
    });

    expect(first.blocked).toBe(false);
    expect(first.actions).toHaveLength(1);

    const second = planMissingOnlyIdentityReconciliation({
      sourceAccounts: [account()],
      sourceEmployees: [employee()],
      canonicalAccounts: [account()],
      canonicalEmployees: [employee()],
    });

    expect(second.blocked).toBe(false);
    expect(second.actions).toEqual([]);
  });

  it("does not mutate source or canonical snapshots during dry-run planning", () => {
    const sourceAccounts = [account()];
    const sourceEmployees = [employee()];
    const canonicalAccounts: Record<string, unknown>[] = [];
    const canonicalEmployees: Record<string, unknown>[] = [];
    const before = JSON.stringify({
      sourceAccounts,
      sourceEmployees,
      canonicalAccounts,
      canonicalEmployees,
    });

    const plan = planMissingOnlyIdentityReconciliation({
      sourceAccounts,
      sourceEmployees,
      canonicalAccounts,
      canonicalEmployees,
    });

    expect(plan.mode).toBe("dry-run");
    expect(
      JSON.stringify({
        sourceAccounts,
        sourceEmployees,
        canonicalAccounts,
        canonicalEmployees,
      })
    ).toBe(before);
  });
});
