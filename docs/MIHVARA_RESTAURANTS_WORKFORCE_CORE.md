# MIHVARA Restaurants — Workforce Core

## Purpose

This module is the first product-core slice for **MIHVARA Restaurants**.

The current Habbat Al Waraq application is the first tenant/seed, not the product itself. The product must therefore remain reusable for future restaurants without copying code or introducing tenant-specific domain names.

## Menno rules for this product

1. **Product Core first**
   - Restaurant workforce capabilities live in generic `workforce_*` domain tables and services.
   - Tenant names are configuration/data, never domain architecture.

2. **Habbat is an adapter/tenant**
   - Existing `habat_*` attendance tables remain supported as a legacy operational source during cutover.
   - Habbat-specific code may exist only in the edge adapter that maps the current tenant/auth/attendance source into the generic core.
   - New payroll, leave, employee-profile and workforce business logic must not be implemented in `habat_*` tables.

3. **No tenant forks**
   - Future restaurant tenants use the same workforce core.
   - Differences are represented by tenant configuration, policies and feature rollout.

4. **Stable domain boundaries**
   - Identity/account authentication is separate from workforce employee identity.
   - Employee profile/employment owns HR facts.
   - Scheduling owns expected work.
   - Attendance owns observed work.
   - Leave/absence owns approved non-work states.
   - Payroll consumes immutable monthly snapshots; it does not rewrite attendance history.
   - Audit is append-only for sensitive HR/payroll actions.

5. **Money and historical data**
   - Money is stored in **halalas** as integers.
   - Payroll approval/payment locks the financial snapshot.
   - Historical schedule/attendance/payroll facts are retained instead of silently recalculating old periods after configuration changes.

## Product boundary

```text
MIHVARA
└── MIHVARA Restaurants
    └── Workforce Core
        ├── Employee Profile / Employment
        ├── Scheduling
        ├── Attendance Bridge
        ├── Leave / Absence
        ├── Payroll
        ├── Monthly Employee Report
        └── Audit
```

Habbat Al Waraq is connected like this:

```text
Habbat UI
  -> Habbat edge adapter
  -> Workforce Core
  -> workforce_* tables

Current attendance during migration:
Habbat attendance UI
  -> existing habat_* attendance source
  -> workforce attendance bridge / monthly snapshot
  -> payroll
```

## Phase 1 scope

Phase 1 introduces the reusable workforce data model and API boundary without deleting or renaming the current Habbat attendance implementation.

Core entities:

- `workforce_tenants`
- `workforce_employee_profiles`
- `workforce_employment`
- `workforce_schedule_templates`
- `workforce_schedule_assignments`
- `workforce_schedule_exceptions`
- `workforce_attendance_links`
- `workforce_attendance_month_snapshots`
- `workforce_leaves`
- `workforce_absences`
- `workforce_leave_balances`
- `workforce_leave_ledger`
- `workforce_payroll_settings`
- `workforce_payroll_periods`
- `workforce_payroll_entries`
- `workforce_payroll_adjustments`
- `workforce_audit_events`

## Functional reference

For the agreed scope, Queens/Malikat is the functional maturity reference:

- employee file
- schedule/shifts and weekly rest
- attendance, absence, lateness, early leave and incomplete punches
- annual/paid/unpaid/emergency leave and leave balance handling
- payroll linked to attendance readiness
- manual additions/deductions with mandatory reason
- monthly payroll lifecycle: draft -> reviewed -> approved -> paid
- employee monthly report and Excel export

Restaurant-specific features outside workforce (orders, POS, menu, kitchen, inventory, suppliers, tables, etc.) are intentionally outside this phase.

## Migration strategy

Do **not** rename or bulk-mutate the current `habat_*` tables in place.

Cutover sequence:

1. Create generic workforce schema.
2. Register the tenant in `workforce_tenants` through the Habbat adapter/bootstrap flow.
3. Synchronize current Habbat access accounts to generic employee profiles.
4. Link each generic employee to the current attendance source through `workforce_attendance_links`.
5. Build employee/employment/schedule/leave/payroll UI against the generic API.
6. Generate immutable attendance monthly snapshots for payroll.
7. Only after parity and production verification, progressively replace legacy attendance storage behind the same domain contracts.

## Non-negotiable invariants

- Core services must not contain `habat` in table names or business rules.
- Every workforce row is tenant-scoped.
- Cross-tenant reads/writes are forbidden by repository methods.
- Payroll cannot auto-deduct attendance when attendance linkage/readiness is unconfirmed.
- Manual payroll adjustments require amount, direction, kind and reason.
- Approved/paid payroll entries are immutable except through explicit audited reversal/reopen workflows.
- Leave and absence states must be visible to attendance/monthly calculation before payroll approval.
- Existing production Habbat attendance remains functional throughout the migration.
