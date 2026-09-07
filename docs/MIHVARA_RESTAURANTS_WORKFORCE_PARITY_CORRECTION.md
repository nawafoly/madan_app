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

## Current gaps being corrected

- `workforce_schedule_templates.working_days_json` currently drives weekly-rest classification. This becomes compatibility fallback only.
- `workforce_schedule_assignments` currently lacks explicit employee weekly-rest/version metadata. Migration 0005 adds it additively.
- Habbat legacy attendance still derives work/off day from legacy shift `working_days`; it must prefer Workforce schedule when the employee is linked.
- Global Habbat "الدوام والشفتات" UI currently exposes working days at template level; this must become a shift-template catalog only.
- Employee payroll UI currently renders reports/lifecycle/readiness/adjustments before salary setup; this order must be reversed.
- Employee workspace needs a clearer Malikat-like separation of basic data, weekly schedule, shifts, attendance, payroll, leaves/absence and reports.

## Compatibility rule

For pre-0005 assignments where `weekly_rest_weekday` is NULL, the resolver may derive the old behavior from the assigned template's `working_days_json`. New assignments must write employee-specific weekly-rest data.
