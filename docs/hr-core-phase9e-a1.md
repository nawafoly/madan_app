# HR Core Phase 9E-A.1

## Scope

- Makes D1 effective permissions authoritative in the HR Worker.
- Removes role-based API bypasses that ignored account-level deny overrides.
- Separates daily-task management from weekly-report manager notes.
- Dual-writes HR account edits, activation state, and permission overrides from Settings to D1.
- Adds an accounts-only migration mode for one-time synchronization of all existing Firestore account overrides.
- Repairs employee rows whose names were imported as UID/document IDs.
- Stops the attendance UI from presenting raw Firebase UIDs as employee names.

## Required order

1. Copy this package over the project.
2. Run TypeScript and test checks.
3. Apply D1 migration `0009_repair_employee_display_names.sql` remotely.
4. Deploy `maedin-hr-api`.
5. Run the accounts-only migration to synchronize current account overrides to D1.
6. Test Owner, HR, Staff, and restricted accounts before committing.

## Important

Do not commit or merge before the restricted-account tests pass. Firebase Auth remains the authentication provider; HR authorization is enforced by D1 effective permissions.
