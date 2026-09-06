export type IdentityHealthCounts = {
  staff_profile_without_employee: number;
  broken_linked_employee_id: number;
  link_auth_mismatch: number;
  employee_without_auth_uid: number;
  employee_without_account: number;
  reverse_link_mismatch: number;
};

export type IdentityHealthResult = {
  ok: boolean;
  counts: IdentityHealthCounts;
};

export function mapIdentityIntegrityHealth(
  row?: Partial<Record<keyof IdentityHealthCounts, unknown>> & Record<string, unknown>
): IdentityHealthResult;
