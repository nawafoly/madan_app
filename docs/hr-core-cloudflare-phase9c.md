# HR Core Cloudflare — Phase 9C

Phase 9C removes the final HR Firestore fallback from:

- `client/src/pages/admin/Employees.tsx`

The shared `client/src/lib/auditLog.ts` remains mixed because it is used by non-HR modules. HR audit writes continue through the HR Core D1 API.

## D1 additions

- `employee_leave_balance_adjustments`
- `GET /api/hr/leave-balance-adjustments`
- `POST /api/hr/employees/:id/leave-balance-adjustments`

## Cutover coverage

The employee administration page now uses D1 for:

- employee directory and profile updates
- work-zone assignments
- absences
- payroll records and salary advances
- leave and employee-service requests
- leave-balance adjustments and history
- employee files and official documents
- employee messages and read state
- employee avatars

Firebase Auth remains for authentication, password reset, and updating the signed-in user's Auth profile image.
