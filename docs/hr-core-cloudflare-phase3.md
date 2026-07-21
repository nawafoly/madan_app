# HR Core Cloudflare — Phase 3

This phase moves HR operational records from Firestore into the `maedin-hr` D1 database.

## D1 tables

- `employee_leave_requests`
- `employee_absences`
- `employee_service_requests`

## Worker APIs

- `GET/POST /api/hr/leave-requests`
- `PATCH /api/hr/leave-requests/:id/review`
- `PATCH /api/hr/leave-requests/:id/cancel-date`
- `GET/POST /api/hr/absences`
- `DELETE /api/hr/absences/:id`
- `GET/POST /api/hr/service-requests`
- `PATCH /api/hr/service-requests/:id/review`
- `POST /internal/hr/operations/import`

## Migration

```powershell
npm run hr:operations:migrate:dry
npm run hr:operations:migrate
```

The import is idempotent by Firestore document id. It can be repeated while Firestore remains the temporary source during the transition.

## Safety rules

- Employees can only read and create their own requests.
- Owner, admin, and HR can review requests and manage absences.
- Partial leave cancellation restores only the cancelled active day.
- A request changes to `cancelled` only when no active dates remain.
- Approval fails if the employee leave balance is insufficient.
