# MIHVARA Restaurants Workforce — Malikat parity correction

## Why this correction exists
Phase 2 shipped the required Workforce domains, but production review exposed an ownership mistake: reusable shift templates still carried weekday/rest semantics, while Malikat treats weekly rest as employee-owned schedule data. The UI also rendered payroll operations before payroll setup, which inverted the operational flow.

This correction is not a cosmetic redesign. It restores domain ownership and runtime precedence while preserving all legacy Habbat attendance data.

## Architecture invariants

1. `workforce_schedule_templates` own reusable **time/policy only**.
2. `workforce_schedule_assignments` own the employee's effective-dated weekly pattern and **one basic weekly-rest weekday**.
3. Existing template `working_days_json` remains only as a legacy fallback for assignments created before migration `0005`.
4. `workforce_schedule_exceptions` remain the dated override layer (`off`, `custom_shift`, `alternate_shift`, `weekly_rest_work`).
5. Resolver precedence remains: dated exception > employee effective schedule > legacy template fallback.
6. Habbat-specific identity/source bridging stays at the Habbat edge. Generic Workforce core/schedule files contain no Habbat tenant knowledge.
7. No `habat_*` table is renamed, dropped, or destructively migrated.
8. Payroll employee UI order is: **setup > readiness > adjustments > lifecycle > report/history**.
9. The global Habbat shift page is a **shift-template editor only**. Weekly rest is chosen from the employee file.

## Migration 0005
`workers/workforce-migrations/0005_workforce_employee_weekly_schedule.sql` additively adds:

- `weekly_rest_weekday`
- `week_pattern_json`
- `reason`
- `operation_id`
- `updated_at`
- idempotency/effective-rest indexes

Existing rows intentionally stay `NULL`. The resolver keeps historical fallback instead of guessing old weekly-rest data.

## Runtime correction
The deterministic integrator `scripts/integrate-workforce-architecture-parity.mjs` applies six runtime changes:

- Workforce template creation stops accepting ownership of employee weekdays.
- New employee schedule assignments require `weeklyRestWeekday` and persist an effective-dated week pattern.
- The generic resolver prefers employee-owned patterns and clearly identifies legacy fallback.
- Habbat V2 clock/context/dashboard shift resolution checks Workforce first, then falls back to legacy Habbat assignments.
- Employee UI exposes the employee's basic weekly rest and fixes tab/payroll ordering.
- Global Habbat shift UI removes weekday editing and explains that weekly rest belongs to each employee.

## Verification
`workers/workforce-architecture-parity-contract.test.mjs` locks the architecture boundaries.

`scripts/rollout-workforce-architecture-parity.ps1` performs:

- expected-base guard against `habat-production`
- deterministic integration
- changed-file allowlist
- architecture/schedule/UI/payroll regression contracts
- local-only D1 proof through migrations `0001..0005`
- `pnpm check`
- `pnpm build`
- commit/push to the correction branch

It deliberately performs **no production D1 migration and no Worker/Pages deployment**.

## Production gate
Do not merge/deploy until all rollout output is green and authenticated Habbat smoke confirms:

- each employee can have a different weekly-rest day while sharing the same shift template;
- weekly rest blocks clock-in through the Workforce-resolved schedule;
- moving weekly rest remains an exception pair rather than rewriting the base schedule;
- payroll setup appears before readiness/lifecycle/reporting;
- no regression exists in leave/payroll locks or legacy attendance history.
