# HR Core Cloudflare — Phase 8A

This phase moves daily tasks and weekly reports from Firestore to Cloudflare D1.

## D1 tables

- `hr_daily_tasks`
- `hr_weekly_reports`

## API routes

- `GET /api/hr/daily-tasks`
- `POST /api/hr/daily-tasks`
- `PATCH /api/hr/daily-tasks/:id`
- `GET /api/hr/weekly-reports`
- `POST /api/hr/weekly-reports`
- `PATCH /api/hr/weekly-reports/:id`
- `POST /internal/hr/tasks-reports/import`

## Migration

```powershell
npm run hr:tasks-reports:migrate:dry
npm run hr:tasks-reports:migrate
```

The migration is idempotent: legacy Firestore document IDs are retained as D1 primary keys.

## Frontend behavior

- Employee daily-task drafts and sent tasks are read from D1.
- HR/admin review lists are read from D1.
- Manager notes are stored in D1.
- Weekly-report drafts, sent reports, and manager notes are stored in D1.
- Attachments continue to use Cloudflare R2.
- Notifications continue to use HR Core D1 from phase 7.

Firebase Authentication remains temporary until the authentication phase is migrated.
