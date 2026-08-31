# MADAN Stage 2C — Schedule Effective Dating

## Status

Foundation implementation for canonical effective-dated employee work-schedule history.

This stage is additive. Existing schedule fields on `employees` remain compatibility/current projections until a later controlled cutover.

## Canonical owner

Canonical work-schedule assignment history:

`employee_schedule_assignments`

The `employees` row must not become a second historical source of truth.

Attendance/location work-zone ownership is not moved into this table. Work zones remain an Attendance / Location Policy concern according to the source-of-truth matrix.

## Schedule facts in Stage 2C

Stage 2C establishes effective-dated history for:

- fixed shift start time;
- fixed shift end time;
- weekly rest-day assignment.

The current compatibility sources are:

- `employees.shift_start_time`
- `employees.shift_end_time`
- `employees.weekly_off_days_json`

## Missing fixed shift windows

A missing fixed shift window is a valid observed compatibility state.

Rules:

- `shift_start_time = NULL` and `shift_end_time = NULL` is preserved as unknown/unassigned fixed hours;
- Madan does not invent default hours;
- a partial pair is invalid;
- if one fixed-shift boundary exists, the other must exist;
- times use canonical `HH:MM` 24-hour representation;
- no rule requires end time to be lexically later than start time because overnight shifts must remain representable.

Production preflight found 14 employees without a fixed shift window and zero partial shift pairs.

Those 14 rows remain explicit completeness signals rather than being silently assigned fabricated hours.

## Weekly rest days

`weekly_off_days_json` is retained as a JSON array in Stage 2C.

Canonical day keys are:

- `sunday`
- `monday`
- `tuesday`
- `wednesday`
- `thursday`
- `friday`
- `saturday`

Rules:

- the value must be valid JSON;
- the JSON value must be an array;
- every member must be a canonical day key;
- duplicate day keys are forbidden;
- an empty array is allowed and means no weekly rest day is currently proven by the compatibility projection.

Production preflight found only:

- `[]`
- `["friday"]`
- `["thursday"]`

All existing values were valid JSON.

## Period semantics

Schedule periods use half-open intervals:

`[effective_from, effective_to)`

Rules:

- `effective_from` is inclusive;
- `effective_to` is exclusive;
- `effective_to = NULL` means open-ended;
- adjacent periods are valid;
- overlapping periods for the same employee are forbidden;
- only one open-ended schedule assignment may exist per employee.

## Historical integrity

Schedule history is append-oriented.

After a schedule assignment exists:

- shift facts cannot be rewritten in place;
- weekly rest facts cannot be rewritten in place;
- historical rows cannot be deleted;
- an open schedule period may only be closed;
- subsequent schedule state is represented by a new effective-dated row.

Closing a schedule assignment may record close metadata without changing the schedule facts that were effective during the period.

## Bootstrap behavior

Migration `0014_schedule_effective_dating.sql` bootstraps one schedule assignment per existing employee.

The bootstrap `effective_from` is the migration/cutover date.

It does not invent a historical schedule-effective date.

Bootstrap source:

`compat_bootstrap_0014`

Bootstrap rules:

- current fixed shift times are copied exactly when present;
- `NULL/NULL` fixed shift windows remain `NULL/NULL`;
- weekly rest JSON is copied exactly after preflight validation;
- no work-zone assignment is copied into the Schedule Kernel.

## Compatibility

The following current employee fields remain temporarily available:

- `shift_start_time`
- `shift_end_time`
- `weekly_off_days_json`

They remain compatibility/current projection fields during migration and must not be used as historical schedule truth after canonical cutover.

Future schedule mutations will move behind server-owned schedule commands.

## Work-zone boundary

`employees.allowed_zone_ids_json` is intentionally excluded from the canonical schedule history introduced here.

Reason:

- a work schedule answers when work is expected;
- a location/attendance policy answers where attendance may be accepted;
- combining them would duplicate ownership across Schedule and Attendance / Location Policy domains.

A later attendance/location-policy stage must own effective-dated zone assignment if zone history is required.

## Current-state view

`hr_current_schedule_assignments` resolves the schedule assignment effective on the current database date.

Historical attendance and payroll calculation must resolve the schedule version effective for the business date being calculated.

They must not blindly use current `employees.shift_*` values.

## Health contract

`hr_schedule_integrity_summary` exposes:

- `invalid_effective_ranges`
- `overlapping_schedule_periods`
- `employees_without_current_schedule_assignment`
- `partial_shift_pairs`
- `invalid_weekly_off_json`
- `noncanonical_weekly_off_days`
- `duplicate_weekly_off_days`
- `current_assignments_without_fixed_shift_window`

The first seven counters are integrity failures and should remain zero.

`current_assignments_without_fixed_shift_window` is a completeness signal, not an integrity failure. It may be non-zero during compatibility cleanup.

Production preflight before Stage 2C found:

- 29 employees;
- 14 employees without shift start;
- 14 employees without shift end;
- 0 partial shift pairs;
- 0 missing weekly-rest JSON values;
- 0 invalid weekly-rest JSON values;
- 0 missing allowed-zone JSON values;
- 0 invalid allowed-zone JSON values.

Observed fixed shift windows included `05:00–13:00`, `07:00–16:00`, `08:00–17:00`, `09:00–17:00`, `12:00–19:00`, plus two existing `05:00` variants. Stage 2C preserves observed values and does not normalize them into invented templates.

## Stage 2C exclusions

This stage does not yet:

- create reusable schedule-template master data;
- canonicalize work-zone assignment history;
- move attendance work-obligation resolution server-side;
- bind payroll records to schedule version IDs;
- remove compatibility schedule columns from `employees`;
- expose UI-owned schedule mutations;
- deploy migrations `0012`, `0013`, or `0014` to Production.

Those changes require separate controlled stages.

## Validation gates

Required before merge:

- isolated SQLite migration contract;
- missing fixed-shift preservation contract;
- partial shift rejection;
- invalid time rejection;
- weekly-rest canonicalization contract;
- duplicate weekly-rest rejection;
- immutable schedule history contract;
- overlap rejection;
- adjacent-period acceptance;
- current-state projection validation;
- Wrangler/D1 local migration parser through `0014`;
- repository diff hygiene.

Production migration remains a separate explicit approval gate.
