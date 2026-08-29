# MADAN Stage 1 — Identity Integrity V1

Status: implementation gate

Foundation baseline: `main@f357b088a2bf39c8dbc25a0da4709ecc70225422`

## Scope

This slice implements the first enforcement layer for:

- `IDN-001`
- `IDN-002`
- `IDN-003`
- `IDN-005`
- `REC-002`

It does not change payroll, attendance, leave, scheduling, GOSI, or compensation behavior.

## Migration

`workers/hr-migrations/0011_identity_integrity_guards.sql`

The migration adds:

1. `hr_identity_integrity_summary` — one-row reconciliation view.
2. Guard that an employee-profile-enabled staff-class account must carry an employee link.
3. Guard against linking an account to an already-existing employee owned by another auth UID.
4. Guard that a newly created/relocated authenticated employee resolves back to the matching account link.
5. Guard against deleting an employee while an account still references it.

## Compatibility rule

HR Core currently performs an account-first / employee-second atomic D1 batch when creating an authenticated employee.

Therefore account creation is allowed to temporarily reference a not-yet-created employee inside the same transaction. The employee insert is the commit-point guard: before the batch can complete, the reverse account/employee link must be coherent.

This preserves the existing repair path while enforcing steady-state integrity.

## Reconciliation view contract

Healthy state requires every returned count to equal zero:

```sql
SELECT * FROM hr_identity_integrity_summary;
```

Fields:

```text
staff_profile_without_employee
broken_linked_employee_id
link_auth_mismatch
employee_without_auth_uid
employee_without_account
reverse_link_mismatch
```

## Pre-migration gate

Before applying remotely:

- D1 current integrity summary equivalent = all zero.
- Firestore employee count matches canonical D1 employee count during legacy transition.
- No legacy Firestore employee missing from D1.
- No UID mismatch.
- TypeScript check passes.
- tests pass.
- production build passes.

Baseline verified before this slice:

```text
D1 accounts: 34
D1 employees: 29
Firestore employees: 29
Firestore users: 33
staff_profile_without_employee: 0
broken_linked_employee_id: 0
link_auth_mismatch: 0
employee_without_auth_uid: 0
employee_without_account: 0
reverse_link_mismatch: 0
missingFromD1: 0
uidMismatch: 0
```

## Local validation gate

Apply only to local D1 first:

```powershell
npx wrangler d1 migrations apply maedin-hr --local --config workers/wrangler.hr.toml
```

Then verify the migration exists and the reconciliation view resolves:

```powershell
npx wrangler d1 execute maedin-hr --local --config workers/wrangler.hr.toml --command "SELECT * FROM hr_identity_integrity_summary;"
```

All six counts must be zero for a seeded local database. An empty local database may naturally return zeros as well; trigger smoke tests are still required before remote rollout.

## Remote rollout STOP gate

Do not apply migration `0011` remotely until:

1. branch CI is green;
2. local migration applies cleanly;
3. trigger smoke tests pass;
4. remote preflight integrity checks remain all zero immediately before migration;
5. the exact migration SHA is reviewed;
6. explicit production rollout approval is given.

## Post-migration verification

Immediately after production migration:

```sql
SELECT * FROM hr_identity_integrity_summary;
```

Expected: all zero.

Then create/repair one test employee through the normal application workflow in a controlled environment and verify:

```text
account.uid == employee.auth_uid
account.linked_employee_id == employee.id
account.employee_profile_enabled == 1
```

No direct SQL repair is permitted unless the canonical workflow cannot recover and the repair is separately approved/audited.
