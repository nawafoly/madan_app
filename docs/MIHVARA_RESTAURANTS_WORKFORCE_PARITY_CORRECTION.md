# MIHVARA Restaurants Workforce — Malikat Parity Correction

This correction exists because Phase 2 reached backend functional coverage but still exposed several concepts at the wrong architectural/UI layer.

## Non-negotiable invariants

1. **Shift template != employee weekly schedule.**
   - A shift template defines reusable time/policy: start, end, grace, break/overtime policy.
   - It must not own an employee's weekly-rest day.

2. **Weekly rest is employee-specific and effective-dated.**
   - Each employee has a base weekly-rest weekday as part of the employee schedule assignment/version.
   - Temporary rest moves are dated exceptions; they do not rewrite the base shift template.
   - Working on the weekly-rest date is a distinct operational state and can create a substitute-rest entitlement only after the required evidence/confirmation flow.

3. **Schedule is an employee domain; shift templates are reusable catalog data.**
   - Employee schedule resolves by date.
   - Date exception > employee effective schedule > legacy compatibility fallback.
   - Habbat edge code must reuse `resolveWorkforceScheduleDay`; it must not maintain a second copy of Workforce classification rules.

4. **Payroll setup precedes payroll execution.**
   Employee payroll workspace order must be:
   1) salary/setup,
   2) readiness,
   3) manual adjustments,
   4) lifecycle/review/approval/payment,
   5) monthly report/history.

5. **Legacy Habbat data remains additive compatibility only.**
   - Do not drop or rename `habat_*` tables.
   - New Workforce rules are generic and tenant-scoped.
   - Habbat-specific routing/source knowledge stays at the adapter edge.

6. **Do not sync this correction to `main` until Habbat production parity is re-validated.**

## Current correction

- `workforce_schedule_templates.working_days_json` becomes compatibility storage only for new templates; new templates are time/policy catalogs.
- Migration `0005_workforce_employee_weekly_schedule.sql` adds employee-owned weekly rest/version metadata to assignments.
- New assignments require `weekly_rest_weekday` and store a deterministic weekly pattern.
- Existing assignments with no explicit weekly-rest metadata retain legacy-template fallback; there is no guessed historical backfill.
- Habbat context/clock flows resolve Workforce schedule first when an attendance link exists, then fall back to legacy Habbat assignments only when no generic employee schedule exists.
- The Habbat edge reuses the generic `resolveWorkforceScheduleDay` resolver rather than duplicating schedule-classification business logic.
- The global Habbat shift page is a template catalog only; weekly rest is edited in the employee schedule.
- Employee payroll UI is reordered to setup -> readiness -> adjustments -> lifecycle -> report.

## Rollout safety

`rollout-workforce-architecture-parity-v4.ps1` is self-recovering:
- it detects and backs up only recognized dirty files left by failed V2/V3 attempts;
- it restores those tracked files before rerun;
- it syntax-checks tooling and runtime JavaScript;
- it runs TypeScript before source contracts;
- it runs parity/schedule/UI/payroll contracts;
- it proves migrations 0001..0005 against a temporary local D1 persistence directory;
- it builds production assets;
- any pre-commit failure saves a diagnostic patch and restores rollout-touched tracked files.

The V3 failure was a gate failure, not a production incident: its contract exposed three issues before any production migration/deploy was allowed — duplicated Habbat schedule resolution instead of generic resolver reuse, non-canonical weekly-rest UI wording, and non-canonical template-only shift wording. V4 corrects these before TypeScript/contracts can pass.

No production D1 migration, Worker deployment, Pages deployment, or `main` synchronization is allowed until this gate is green and authenticated parity is re-validated.
