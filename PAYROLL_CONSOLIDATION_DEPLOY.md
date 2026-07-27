# Payroll consolidation deployment

## What changes

- `/hr/payroll` is the only place that calculates, finalizes, reopens, and exports payroll.
- `/hr/employees` keeps salary settings and payroll history only.
- A finalized payroll can be reopened as a draft with a mandatory reason.
- Paid payroll records cannot be reopened.
- Approved salary advances stay attached while a payroll is reopened and are reconciled when it is finalized again.
- Mudad PDF/PNG/JPG documents can be attached from the central payroll screen.
- Employee-specific overtime multiplier is read from the employee employment settings.
- Daily and hourly rates are shown from the unified calculation engine.

## Required deployment order

1. Run TypeScript and production build.
2. Apply HR D1 migration `0009_payroll_lifecycle.sql` remotely.
3. Deploy HR Core Worker.
4. Commit and push frontend/backend files to `main`.

## Commands

```powershell
cd C:\Users\nawaf\Downloads\madan
npm run check
npm run build

npx.cmd wrangler d1 migrations apply maedin-hr `
  --remote `
  --config workers/wrangler.hr.toml

npx.cmd wrangler deploy --config workers/wrangler.hr.toml
```

Do not deploy the Worker before applying migration 0009, because the lifecycle endpoints use the new payroll columns.
