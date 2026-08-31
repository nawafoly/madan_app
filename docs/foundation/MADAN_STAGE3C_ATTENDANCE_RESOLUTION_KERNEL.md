# MADAN Stage 3C — Canonical Attendance Resolution Kernel

Status: Foundation contract
Scope: additive schema foundation; no Production migration or Attendance/Payroll runtime cutover in this stage

## Objective

Establish one immutable, versioned **daily attendance resolution** that is resolved against the exact canonical Work Obligation revision and later becomes Payroll's attendance input.

The target chain is:

```text
Attendance D1 raw events
+ canonical Work Obligation revision
+ effective attendance policies
+ governed correction/evidence inputs
-> server Attendance resolver
-> immutable daily Attendance Resolution revision
-> Payroll references that exact resolution
```

This implements the Golden Employee Journey requirement:

```text
AttendanceRecorded
-> daily resolution
-> correction/exception workflow if needed
-> canonical payroll-impacting attendance result
```

## Source-of-truth boundary

The foundation Source of Truth Matrix already separates these facts:

- raw attendance events — Attendance D1 event ledger
- current check-in state — Attendance projection
- monthly attendance summary — rebuildable Attendance projection
- daily attendance/payroll resolution — target Attendance + Time + Policy Kernel
- Attendance correction — target Attendance Workflow Kernel
- Overtime candidate — target Time/Attendance Kernel; not automatically payable

Stage 3C follows that boundary exactly.

`employee_attendance_resolutions` does **not** become the owner of raw punches. It is the immutable governed result derived from them for one employee/business date.

## Cross-D1 evidence

The audited runtime binds raw attendance through a separate `ATTENDANCE_DB` durable boundary. HR D1 therefore cannot create a real relational foreign key to raw punch/event rows in another D1 database.

Stage 3C intentionally stores:

- `source_evidence_json`
- `resolution_inputs_json`

as auditable JSON objects. A resolver can retain the Attendance D1 source identity, raw event IDs, query/correlation metadata, correction evidence, and other provenance there without pretending cross-database atomicity or ownership.

This follows the cross-domain rule that writes spanning durable boundaries require workflow/outbox/reconciliation semantics rather than assumed atomicity.

## Why migration `0020` bootstraps zero rows

Migration `0020_attendance_resolution_kernel.sql` creates the canonical contract but no historical or current attendance resolution rows.

A migration-time bootstrap would be unsafe because:

1. raw attendance evidence is owned by another D1 boundary;
2. existing monthly/payroll summaries are projections, not raw event truth;
3. Stage 3A created policy definitions but did not fabricate concrete legal/company policy versions;
4. Stage 3B intentionally created Work Obligation schema without fabricating resolved rows;
5. a valid attendance resolution requires the exact Work Obligation revision and effective policies used on that business date.

Therefore backfill/cutover must be an explicit resolver workflow, not a schema migration guess.

## Canonical table

`employee_attendance_resolutions` stores:

- canonical employee ID
- attendance business date
- immutable revision number
- exact `work_obligation_id`
- resolution kind
- first/last normalized observed timestamps when attended
- worked minutes
- policy-resolved late minutes
- policy-resolved early-exit minutes
- overtime **candidate** minutes
- effective `SA-ATTENDANCE` policy version
- effective `SA-LATE-EARLY` policy version when an attended row resolves late/early metrics
- source evidence object
- resolver input object
- globally unique idempotency key
- superseded-resolution link
- source/reason/resolver audit metadata

## Resolution kinds

The kernel uses four deliberately narrow daily outcomes.

### `attended`

The referenced Work Obligation must be `work`.

The row carries:

- first observed timestamp
- last observed timestamp
- positive worked minutes
- resolved late minutes
- resolved early-exit minutes
- overtime candidate minutes
- effective Attendance policy
- effective Late/Early policy

### `absent`

The referenced Work Obligation must be `work`.

The row carries zero worked/late/early/overtime-candidate minutes and no observed timestamps. It still references the effective Attendance policy used by the resolver.

An explicit legacy absence entry may be evidence, but it does not bypass Work Obligation/leave/policy resolution.

### `non_working`

The referenced Work Obligation must already classify the date as one of:

- weekly rest
- approved leave
- holiday
- approved exception
- not employed

Attendance does not independently reconstruct those domains. It consumes the Work Obligation result and records zero attendance metrics.

### `unresolved`

The resolver could not safely reach a payroll-impacting attendance conclusion because a required input is missing, contradictory, stale, or awaiting a governed correction.

All attendance metrics remain `NULL`. Policy IDs may also be absent when the missing policy is itself the blocking condition.

Financially sensitive downstream consumers must fail closed on a current `unresolved` result.

## Exact Work Obligation reference

Every Attendance Resolution references one exact `employee_work_obligations.id`.

At insert time, that Work Obligation must:

- belong to the same employee;
- have the same business date;
- be the current Work Obligation revision for that employee/date.

Historical Attendance Resolution rows are never rewritten if the Work Obligation is later revised. Instead, the resolver creates a new Attendance Resolution revision against the new current obligation.

That preserves reproducibility for older Payroll revisions while preventing new attendance calculations from silently binding to stale schedule results.

## Policy versioning

A finalized daily resolution uses the exact policy versions effective for the attendance date.

`attendance_policy_version_id` must resolve to:

- policy key `SA-ATTENDANCE`
- non-draft status
- an effective period covering the business date

`late_early_policy_version_id` must resolve to:

- policy key `SA-LATE-EARLY`
- non-draft status
- an effective period covering the business date

Stage 3C does not seed grace minutes, thresholds, Saudi legal values, or company-specific rules. Those values remain governed Policy Kernel data.

## Overtime boundary

`overtime_candidate_minutes` is intentionally **not payable overtime**.

The Golden Journey requires:

```text
extra attendance time
-> overtime candidate
-> eligibility policy
-> approval
-> cash obligation OR compensatory-time entitlement
```

Accordingly Stage 3C contains no:

- overtime pay amount
- overtime bonus
- payable overtime minutes
- direct Payroll settlement instruction

A later Overtime Workflow/Time Kernel must consume the candidate, resolve `SA-OVERTIME-ELIGIBILITY`, obtain required approval, and only then create a financial obligation or compensatory-time entitlement.

## Correction and revision model

Attendance resolution is immutable.

```text
employee + date + revision 1
-> correction/re-resolution revision 2
-> final corrected revision 3
```

Rules:

- revision 1 cannot supersede another row;
- revision N must supersede revision N-1 for the same employee/date;
- one historical row can be superseded only once;
- updates are blocked;
- deletes are blocked;
- each resolver command has a globally unique idempotency key.

`hr_current_attendance_resolutions` returns the highest revision for each employee/date.

An in-progress correction may create an `unresolved` revision so Payroll fails closed until the governed correction is resolved.

## Payroll boundary

The current legacy payroll table still contains attendance summary scalars/JSON such as expected/actual hours, late/missing/overtime hours, and schedule snapshots.

Those remain compatibility/current payroll inputs during migration.

Target Payroll behavior is:

```text
Payroll period
-> exact Work Obligation revisions
-> exact Attendance Resolution revisions
-> exact Leave/GOSI/Compensation/Policy versions
-> immutable Payroll calculation revision
```

Payroll must not independently recompute attendance from raw punches after cutover.

## Integrity view

`hr_attendance_resolution_integrity_summary` exposes:

- current unresolved resolutions
- invalid revision links
- invalid Work Obligation references
- invalid Attendance policy references
- invalid Late/Early policy references
- current attended rows missing worked minutes
- current Attendance/Work Obligation kind conflicts

Database constraints/triggers block the known invalid write paths; the view remains a reconciliation/system-health surface.

## Validation contract

`server/hr-attendance-resolution-kernel.test.ts` proves:

- migration creates zero fabricated attendance rows
- an attended result references the exact Work Obligation revision
- normalized attendance metrics are preserved
- cross-D1 raw punch IDs are evidence, not foreign-owned HR rows
- weekly rest resolves as `non_working`
- non-working/work outcomes cannot contradict Work Obligation type
- cross-employee Work Obligation references are rejected
- wrong policy families are rejected
- evidence/input JSON must be objects
- revision chains cannot skip history
- current view selects the latest revision
- prior revisions remain queryable
- historical rows cannot be updated or deleted
- duplicate idempotency keys are rejected
- integrity summary remains coherent
- Attendance Kernel has no payable overtime field

## Explicit exclusions

Stage 3C does **not** yet implement:

- server API/command that reads Attendance D1 raw events and resolves the day
- raw attendance event migration or ownership transfer
- automatic historical attendance backfill
- typed Attendance Correction Workflow
- canonical Holiday Kernel
- typed approved attendance exception owner
- overtime eligibility/approval/pay conversion
- Payroll calculation cutover
- UI replacement
- Production migration deployment

## Production gate

Migration `0020` is repository work only until explicitly approved for Production.

At this stage, migrations `0012` through `0020` remain subject to a separate Production D1 approval gate.
