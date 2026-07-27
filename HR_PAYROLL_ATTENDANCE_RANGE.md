# HR Payroll — Attendance Range

Route: `/hr/payroll`

## Workflow

1. Select the payroll month.
2. Select attendance start and end dates.
3. Click **Load attendance and calculate payroll**.
4. The page loads allowed attendance records, approved leave, HR absences, salary advances, schedules, and salary settings.
5. Drafts are prepared for review; no payroll is finalized automatically.
6. Review each employee, adjust additions/deductions, optionally include overtime, then finalize individually.

## Default cycle

When a payroll month is selected, the default attendance cycle is the 21st of the previous month through the 20th of the payroll month. Both dates remain editable.

## Guards

- Start date must not be after end date.
- End date must not be in the future.
- Attendance range is limited to 62 days.
- Existing finalized payroll records are not overwritten.
- Approved paid leave is excluded from absence detection but remains part of the salary-rate denominator.

## Deployment

No D1 migration or Worker deployment is required for this patch. Run:

```powershell
npm run check
npm run build
```

Then commit and push the changed files to `main`.
