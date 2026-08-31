# MADAN Stage 2A — Employment Effective Dating

## Status

Foundation implementation for canonical effective-dated employment history.

This stage is additive. Existing `employees` employment fields remain compatibility/current projections until a later controlled cutover.

## Canonical owner

Canonical employment history:

`employee_employment_assignments`

The `employees` row is not allowed to become a second historical source of truth.

## Period semantics

Employment periods use half-open intervals:

`[effective_from, effective_to)`

Rules:

- `effective_from` is inclusive.
- `effective_to` is exclusive.
- `effective_to = NULL` means the period is open-ended.
- adjacent periods are valid.
- overlapping periods for the same employee are forbidden.
- only one open-ended period may exist per employee.

Example:

- Period A: `2026-01-01` → `2026-05-01`
- Period B: `2026-05-01` → `NULL`

Both are valid and non-overlapping.

## Historical integrity

Employment history is append-oriented.

After a period exists:

- employment facts cannot be rewritten in place;
- historical rows cannot be deleted;
- an open period may only be closed by setting `effective_to`;
- subsequent employment state is represented by a new period.

This implements the foundation rule that later employment changes must not destroy the state used by previous payroll periods.

## Foundation invariants

### EMP-001

Employment periods for the same employee cannot overlap illegally.

Enforced by:

- database overlap trigger;
- unique open-period index;
- contract tests;
- integrity health view.

### EMP-003

Employment changes are effective-dated and historical payroll inputs cannot depend on overwritten current values.

Stage 2A establishes the employment-history side of this invariant.

Payroll version binding remains a later kernel stage.

## Bootstrap behavior

Migration `0012_employment_effective_dating.sql` bootstraps one record per existing employee.

Important:

The bootstrap `effective_from` is the migration/cutover date.

It does **not** use the employee hire date as historical effective state because Madan cannot reconstruct employment history that was never canonically stored.

Existing `employees.start_date` is preserved separately as `employment_start_date` when valid.

Bootstrap source:

`compat_bootstrap_0012`

## Compatibility

The following current employee fields remain temporarily available:

- `employment_status`
- `title`
- `department`
- `start_date`
- other existing employment compatibility fields

They remain projections/compatibility inputs during migration and must not be treated as canonical employment history.

Future employment mutations will move behind server-owned employment commands.

## Organization references

The assignment table reserves:

- `branch_id`
- `team_id`
- `position_id`
- `manager_employee_id`

`position_title` and `department` currently preserve compatibility values.

They must not become permanent uncontrolled master-data identifiers.

Organization Master will later own canonical branch/team/position/department references.

## Health contract

`hr_employment_integrity_summary` exposes:

- `invalid_effective_ranges`
- `overlapping_assignment_periods`
- `employees_without_current_assignment`
- `noncanonical_employment_statuses`

A healthy steady state requires all counters to be zero.

## Current-state view

`hr_current_employment_assignments` resolves employment assignments effective on the current database date.

Historical/as-of business calculations must resolve against the requested business date rather than blindly using this current-state view.

## Stage 2A exclusions

This stage does not yet:

- move compensation history;
- move GOSI history;
- move schedule history;
- remove compatibility columns from `employees`;
- expose UI-owned employment mutations;
- rewrite existing production history;
- deploy migration `0012` to production.

Those changes require separate controlled stages.

## Validation completed before merge

Required gates:

- isolated SQLite migration contract;
- immutable-history contract;
- overlap rejection;
- adjacent-period acceptance;
- health summary zero-state;
- Wrangler/D1 local migration parser;
- production read-only compatibility inspection;
- repository diff hygiene.

Production migration remains a separate explicit approval gate.
