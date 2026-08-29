const IDENTITY_HEALTH_FIELDS = [
  "staff_profile_without_employee",
  "broken_linked_employee_id",
  "link_auth_mismatch",
  "employee_without_auth_uid",
  "employee_without_account",
  "reverse_link_mismatch",
];

export function mapIdentityIntegrityHealth(row = {}) {
  const counts = {};
  for (const field of IDENTITY_HEALTH_FIELDS) {
    counts[field] = Number(row?.[field] || 0);
  }
  return {
    ok: Object.values(counts).every(value => value === 0),
    counts,
  };
}
