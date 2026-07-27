# HR Payroll V1

Route: `/hr/payroll`

Included:
- Payroll permissions: `payroll.view`, `payroll.manage`
- HR sidebar and HR portal entry
- Monthly filters, employee search, payroll status filters
- Monthly draft calculation from attendance, leave, absences, salary advances, salary data, and work schedules
- Safe batch draft generation (does not finalize salaries automatically)
- Manual additions and deductions before finalization
- Optional overtime calculation
- Individual finalization through the existing HR Core payroll API
- Monthly Excel export and print/PDF output
- Individual salary slip print/PDF output

Deployment:
1. Apply the patch to the project.
2. Run `npm run check`.
3. Run `npm run build`.
4. Commit and push to `main`.

The page uses the existing HR Core payroll tables and API from migration `0003_create_payroll_core.sql`; no new database migration is included.
