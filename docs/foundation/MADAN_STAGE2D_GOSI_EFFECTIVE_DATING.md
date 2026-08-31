# MADAN Stage 2D — GOSI Effective Dating

## Status

Foundation implementation for canonical effective-dated GOSI profile history.

This stage is additive. Existing legacy HR fields remain compatibility/current values until a later controlled cutover.

## Canonical owner

Canonical GOSI profile history:

`employee_gosi_profiles`

The `employees` row must not become a second historical source of truth.

## Source-of-truth contract

The foundation Source of Truth Matrix distinguishes:

- Basic Wage → Compensation Kernel
- Actual / Fixed Wage → Compensation Kernel
- GOSI Wage → GOSI Kernel
- GOSI profile → GOSI Kernel
- GOSI employee contribution → GOSI calculation ledger
- GOSI employer contribution → GOSI calculation ledger

These concepts must not be collapsed into one salary or deduction field.

## Legacy insurance deduction is not GOSI Wage

The audited legacy employee row contains `insurance_deduction`.

Stage 2D deliberately does **not** interpret that scalar as:

- GOSI Wage;
- proof that GOSI applies to the employee;
- a GOSI policy version;
- a canonical employee contribution calculation;
- an employer contribution calculation.

The value remains available only as a compatibility field until the dedicated GOSI calculation/ledger migration.

Production read-only preflight found:

- 29 employees
- 22 employees with `insurance_deduction = NULL`
- 2 employees with explicit zero
- 5 employees with positive values
- 0 negative values
- observed positive values: 300, 400, 410, 487.5, 717.5

Those values are insufficient to reconstruct a trustworthy GOSI Wage or policy history, so Stage 2D does not infer either.

## Profile concepts

Each effective-dated GOSI profile records:

- `applicability_status`
- `gosi_wage`
- `policy_version_key`
- `policy_inputs_json`
- source/reason/audit metadata

Canonical applicability states in this stage:

- `unknown`
- `applicable`
- `not_applicable`
- `exempt`

`policy_inputs_json` is an object reserved for confirmed policy inputs that belong to the effective profile version. It is not populated from legacy deductions.

## Bootstrap behavior

Migration `0015_gosi_effective_dating.sql` bootstraps one current GOSI profile per existing employee.

The bootstrap records only what is actually known at cutover:

- `applicability_status = unknown`
- `gosi_wage = NULL`
- `policy_version_key = NULL`
- `policy_inputs_json = {}`

Bootstrap source:

`compat_bootstrap_0015`

The bootstrap `effective_from` is the migration/cutover date. It does not invent pre-cutover GOSI history.

This deliberately produces completeness signals that later HR/GOSI onboarding must resolve.

## Period semantics

GOSI profile periods use half-open intervals:

`[effective_from, effective_to)`

Rules:

- `effective_from` is inclusive;
- `effective_to` is exclusive;
- `effective_to = NULL` means open-ended;
- adjacent periods are valid;
- overlapping periods for the same employee are forbidden;
- only one open-ended GOSI profile may exist per employee.

## Historical integrity

GOSI profile history is append-oriented.

After a profile exists:

- applicability cannot be rewritten in place;
- GOSI Wage cannot be rewritten in place;
- policy version/input facts cannot be rewritten in place;
- historical rows cannot be deleted;
- an open profile may only be closed;
- a subsequent state is represented by a new profile period.

Closing a profile may add close metadata without rewriting the business facts that were effective during that period.

## GOSI invariants

This stage establishes the schema foundation for the existing project invariants:

### PAY-001

Basic Wage, Actual/Fixed Wage, and GOSI Wage are distinct canonical values.

### GOS-001

A GOSI-enabled/applicable employee must have required effective GOSI Wage/policy inputs before payroll approval.

Stage 2D intentionally does not force a fabricated value merely to make this completeness check pass.

### GOS-002

Employee and employer GOSI contribution results are stored separately.

Contribution-result storage is outside Stage 2D and belongs to the later GOSI calculation ledger.

### GOS-003

Historical GOSI calculation must be tied to the policy/wage version effective for the payroll period.

The effective-dated profile established here provides that versionable input boundary.

## Current-state view

`hr_current_gosi_profiles` resolves the GOSI profile effective on the current database date.

Historical payroll/GOSI calculation must resolve the profile effective for the payroll business period, not blindly read current employee compatibility fields.

## Health contract

`hr_gosi_integrity_summary` exposes:

- `invalid_effective_ranges`
- `overlapping_gosi_periods`
- `employees_without_current_gosi_profile`
- `negative_gosi_wage_values`
- `current_unknown_applicability`
- `current_applicable_missing_gosi_wage`
- `current_applicable_missing_policy_version`

The first four counters represent structural/integrity failures and should remain zero.

The final three are completeness signals. They may be non-zero during controlled migration and data confirmation.

## Stage 2D exclusions

This stage does not yet:

- calculate employee GOSI contribution;
- calculate employer GOSI contribution;
- create the GOSI calculation ledger;
- derive contribution percentages or thresholds;
- invent policy rules from legacy deduction amounts;
- bind payroll records to a GOSI calculation/version ID;
- cut over existing payroll calculation;
- remove `employees.insurance_deduction`;
- deploy migration `0015` to Production.

Those changes require separate controlled stages and explicit policy implementation.

## Validation gates

Required before merge:

- isolated SQLite migration contract;
- no-inference bootstrap contract;
- Basic/Actual/GOSI Wage separation contract;
- applicability-state contract;
- policy-input JSON object contract;
- immutable GOSI profile contract;
- overlap rejection;
- adjacent-period acceptance;
- current-state projection validation;
- Wrangler/D1 local migration parser through `0015`;
- repository diff hygiene.

Production migration remains a separate explicit approval gate.
