# HR Core Cloudflare Phase 9A

This cutover removes Firestore fallbacks from five HR/employee entry points while retaining Firebase Auth for ID-token authentication:

- employee profile access guard
- dashboard HR sidebar employee profile
- in-app notifications
- employee files
- employee internal messages

No D1 migration or Worker deployment is required. The change is frontend-only and is guarded by `server/hr-firestore-cutover.test.ts`.

Phase 9B remains responsible for the larger HR pages: employee profile, employee management, HR attendance, and HR staff portal.
