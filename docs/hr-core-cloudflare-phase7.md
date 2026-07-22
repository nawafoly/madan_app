# HR Core Cloudflare — Phase 7

This phase moves internal notifications and the operational audit log to Cloudflare D1.

## D1 additions

- `hr_notifications`
- Expanded `hr_audit_logs` payload fields
- `notifications.manage` permission
- `audit.view` permission

## API additions

- `GET /api/hr/notifications`
- `POST /api/hr/notifications`
- `PATCH /api/hr/notifications/:id/read`
- `POST /api/hr/notifications/read-all`
- `GET /api/hr/audit-logs`
- `POST /api/hr/audit-logs`
- `POST /internal/hr/notifications-audit/import`

## Frontend changes

- Notification bell reads Cloudflare D1 and refreshes every 30 seconds.
- Notification creation and read state use Cloudflare when `VITE_USE_HR_D1=true`.
- Employee and HR notification badges no longer query Firestore directly.
- Employee leave and service request notifications target HR roles through D1 accounts.
- Audit events are written to D1 through HR Core.
- The admin audit-log page reads D1 when HR Core is enabled.

## Transition boundary

Firebase Authentication remains the temporary identity provider. Firestore fallback code remains inside the notification and audit adapters only, so rollback is possible while production environment variables are being activated.
