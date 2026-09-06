export type NormalizedIdentityAccount = {
  uid: string | null;
  role: string;
  employeeProfileEnabled: boolean;
  linkedEmployeeId: string | null;
  raw: Record<string, unknown>;
};

export type NormalizedIdentityEmployee = {
  id: string | null;
  authUid: string | null;
  raw: Record<string, unknown>;
};

export type DuplicateIdentityKey = {
  key: string;
  count: number;
};

export type IdentityIntegrityResult = {
  ok: boolean;
  counts: {
    staff_profile_without_employee: number;
    broken_linked_employee_id: number;
    link_auth_mismatch: number;
    employee_without_auth_uid: number;
    employee_without_account: number;
    reverse_link_mismatch: number;
    duplicate_account_uid: number;
    duplicate_employee_id: number;
    duplicate_employee_auth_uid: number;
  };
  details: {
    staffProfileWithoutEmployee: string[];
    brokenLinkedEmployeeId: string[];
    linkAuthMismatch: string[];
    employeeWithoutAuthUid: string[];
    employeeWithoutAccount: string[];
    reverseLinkMismatch: string[];
    duplicateAccountUid: DuplicateIdentityKey[];
    duplicateEmployeeId: DuplicateIdentityKey[];
    duplicateEmployeeAuthUid: DuplicateIdentityKey[];
  };
};

export type IdentityReconciliationAction = {
  type: "insert_missing_identity_pair";
  authUid: string;
  employeeId: string;
  account: Record<string, unknown>;
  employee: Record<string, unknown>;
  preconditions: {
    canonicalAccountAbsent: true;
    canonicalEmployeeIdAbsent: true;
    canonicalEmployeeAuthUidAbsent: true;
  };
};

export type IdentityReconciliationPlan = {
  mode: "dry-run";
  policy: "missing-only-no-overwrite";
  blocked: boolean;
  summary: {
    sourceAccounts: number;
    sourceEmployees: number;
    canonicalAccounts: number;
    canonicalEmployees: number;
    candidateActions: number;
    executableActions: number;
    conflicts: number;
  };
  canonicalIntegrity: IdentityIntegrityResult;
  sourceIntegrity: IdentityIntegrityResult;
  conflicts: Array<Record<string, unknown> & { code: string }>;
  candidateActions: IdentityReconciliationAction[];
  actions: IdentityReconciliationAction[];
};

export function normalizeIdentityAccount(
  row?: Record<string, unknown>
): NormalizedIdentityAccount;

export function normalizeIdentityEmployee(
  row?: Record<string, unknown>
): NormalizedIdentityEmployee;

export function evaluateIdentityIntegrity(args?: {
  accounts?: Record<string, unknown>[];
  employees?: Record<string, unknown>[];
}): IdentityIntegrityResult;

export function planMissingOnlyIdentityReconciliation(args?: {
  sourceAccounts?: Record<string, unknown>[];
  sourceEmployees?: Record<string, unknown>[];
  canonicalAccounts?: Record<string, unknown>[];
  canonicalEmployees?: Record<string, unknown>[];
}): IdentityReconciliationPlan;
