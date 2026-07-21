# HR Core Cloudflare — Phase 8B

This phase migrates employee file metadata and internal employee/HR messages from Firestore to Cloudflare D1.

## D1 tables

- `hr_employee_files`: metadata for files already stored in Cloudflare R2.
- `hr_employee_messages`: HR-to-employee and employee-to-employee messages.

## API

- `GET/POST /api/hr/employee-files`
- `PATCH /api/hr/employee-files/:id/read`
- `DELETE /api/hr/employee-files/:id`
- `GET/POST /api/hr/employee-messages`
- `PATCH /api/hr/employee-messages/:id/read`
- `POST /api/hr/employee-messages/read-all`

## Migration

`migrate-hr-files-messages-to-cloudflare.mjs` reads `employee_files` and `employee_messages` from Firestore and imports them through `/internal/hr/files-messages/import`.

R2 objects are not duplicated. Existing `filePath` and `fileUrl` metadata continue to reference Cloudflare R2.
