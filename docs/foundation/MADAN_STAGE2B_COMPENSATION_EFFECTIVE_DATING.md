# MADAN Stage 2B — Compensation Effective Dating

## Status

Foundation implementation for canonical effective-dated compensation history.

This stage is additive. Existing compensation fields on `employees` remain compatibility/current projections until a later controlled cutover.

## Canonical owner

Canonical compensation history:

`employee_compensation_terms`

Typed allowance components:

`employee_compensation_components`

The `employees` row must not become a second historical source of truth.

## Compensation concepts

Madan keeps these concepts distinct:

- Basic Wage
- Actual / Fixed Wage
- GOSI Wage
- typed allowance components

Stage 2B establishes the first two compensation concepts and typed allowance history.

GOSI Wage remains owned by the later GOSI Kernel stage.

## Basic Wage vs Actual / Fixed Wage

`basic_wage` and `actual_fixed_wage` are separate fields.

Rules:

- Actual / Fixed Wage is never inferred from Basic Wage.
- Basic Wage may be unknown during compatibility bootstrap.
- Missing historical facts remain missing.
- A later confirmed compensation change creates a new effective-dated term.

This is required so future payroll and compliance calculations can bind to the exact compensation version used for a business period.

## Period semantics

Compensation periods use half-open intervals:

`[effective_from, effective_to)`

Rules:

- `effective_from` is inclusive.
- `effective_to` is exclusive.
- `effective_to = NULL` means open-ended.
- adjacent periods are valid.
- overlapping periods for the same employee are forbidden.
- only one open-ended compensation term may exist per employee.

## Historical integrity

Compensation history is append-oriented.

After a compensation term exists:

- wage facts cannot be rewritten in place;
- typed components cannot be rewritten in place;
- historical rows cannot be deleted;
- an open compensation period may only be closed;
- subsequent compensation state is represented by a new term and new component rows.

Closing a term may record close metadata without changing the compensation facts that were effective during the period.

## Typed allowance components

Allowances are stored against one compensation term version.

Supported component types in Stage 2B:

- `housing_allowance`
- `transportation_allowance`
- `other_allowance`

Each component also has a `component_code` so future compensation policy can distinguish multiple components within a type.

Compatibility bootstrap mappings:

- `employees.housing_allowance` → `housing_allowance / housing`
- `employees.transportation_allowance` → `transportation_allowance / transportation`
- `employees.other_allowances` → `other_allowance / legacy_other_allowances`

Explicit zero values are preserved as zero.

Missing values are not fabricated as zero.

## Bootstrap behavior

Migration `0013_compensation_effective_dating.sql` bootstraps one compensation term per existing employee.

The bootstrap `effective_from` is the migration/cutover date.

It does not invent a historical wage-effective date.

Bootstrap source:

`compat_bootstrap_0013`

Bootstrap rules:

- `basic_wage` is copied from `employees.base_salary` when present;
- missing Basic Wage remains `NULL`;
- `actual_fixed_wage` remains `NULL` because the legacy model does not prove that value;
- allowance components are copied only when the legacy value is explicitly present;
- currency is initialized as `SAR` for the current Saudi employment product scope.

## Compatibility

The following current employee fields remain temporarily available:

- `base_salary`
- `housing_allowance`
- `transportation_allowance`
- `other_allowances`

They remain compatibility/current projection fields during migration and must not be used as historical compensation truth after canonical cutover.

Future compensation mutations will move behind server-owned compensation commands.

## Current-state view

`hr_current_compensation_terms` resolves the compensation term effective on the current database date and projects typed allowance totals.

Historical payroll calculation must resolve the compensation term effective for the payroll business date or period.

It must not blindly use the current employee row.

## Health contract

`hr_compensation_integrity_summary` exposes:

- `invalid_effective_ranges`
- `overlapping_compensation_periods`
- `employees_without_current_compensation_term`
- `negative_compensation_values`
- `negative_component_values`
- `current_terms_missing_basic_wage`

The first five counters are integrity failures and should remain zero.

`current_terms_missing_basic_wage` is a completeness signal, not an integrity failure. It may be non-zero during compatibility cleanup.

Production preflight before Stage 2B found:

- 29 employees
- 10 employees with missing Basic Wage
- 0 negative Basic Wage values
- 0 negative housing allowance values
- 0 negative transportation allowance values
- 0 negative other allowance values

Stage 2B therefore preserves missing Basic Wage as unknown rather than inventing a value.

## Stage 2B exclusions

This stage does not yet:

- create GOSI Wage history;
- move payroll calculation server-side;
- bind payroll records to compensation version IDs;
- remove compatibility compensation columns from `employees`;
- expose UI-owned compensation mutations;
- deploy migration `0013` to Production.

Those changes require separate controlled stages.

## Validation gates

Required before merge:

- isolated SQLite migration contract;
- Basic Wage / Actual-Fixed Wage separation contract;
- missing-value preservation contract;
- typed allowance bootstrap contract;
- immutable compensation term contract;
- immutable component contract;
- overlap rejection;
- adjacent-period acceptance;
- current-state projection validation;
- Wrangler/D1 local migration parser through `0013`;
- repository diff hygiene.

Production migration remains a separate explicit approval gate.
