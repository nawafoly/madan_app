# MADAN Stage 3B — Canonical Work Obligation Kernel

Status: Foundation contract
Scope: additive schema foundation; no Production migration or API/UI cutover in this stage

## Objective

Establish one date-specific, versioned `Work Obligation` contract that becomes the shared schedule result consumed by Attendance and Payroll.

This closes a critical architecture gap identified in the foundation audit: schedule calculation currently exists in employee compatibility fields and client helpers, while payroll-impacting attendance must eventually resolve against one server-owned work obligation.

The Golden Employee Journey requires:

```text
AssignSchedule
-> effective schedule assignment
-> weekly rest
-> approved exception
-> leave
-> holiday
-> policy
-> date-specific Work Obligation
-> Attendance + Payroll consume the same result
```

## Source-of-truth boundaries

Stage 3B does not move ownership of the source facts.

Canonical owners remain:

- `employee_schedule_assignments` — effective-dated schedule history
- `employee_leave_requests` — leave workflow record
- `hr_policy_versions` — versioned/effective-dated policy contracts
- future holiday/exception kernels — authoritative holiday/exception facts

`employee_work_obligations` stores an immutable **resolution snapshot** built from those canonical inputs for a specific employee and business date.

It is a versioned projection/snapshot, not a replacement for Schedule, Leave, Employment or Policy ownership.

## Why no migration bootstrap

Migration `0019_work_obligation_kernel.sql` intentionally creates **zero** work-obligation rows.

Reason:

1. Stage 3A seeded policy definitions only.
2. It intentionally did not invent legal/company policy rates or concrete policy versions.
3. A work obligation is the result of applying schedule + rest + leave/exception/holiday + policy.
4. Therefore generating rows inside migration `0019` would fabricate a policy decision that does not yet exist.

The later server-side resolver must create obligations only after the required policy/input versions are available.

## Daily obligation kinds

Every resolved business date has one current revision with one of these kinds:

- `work` — employee has a scheduled work obligation
- `weekly_rest` — configured weekly rest day
- `approved_leave` — approved leave replaces an otherwise scheduled work obligation
- `holiday` — governed holiday exclusion
- `approved_exception` — governed approved exception removes the work obligation
- `not_employed` — employee is outside the effective employment period
- `unresolved` — resolver cannot safely determine the obligation because a required source/policy input is missing or contradictory

Financial/compliance-sensitive downstream calculations must fail closed on `unresolved` rather than silently assuming work or rest.

## Scheduled work snapshot

A `work` row stores:

- employee ID
- work date
- effective schedule assignment ID
- exact fixed shift start/end snapshot
- expected work minutes
- effective `SA-WORK-SCHEDULE` policy version
- resolver inputs/evidence
- idempotency key
- immutable revision metadata

The shift snapshot must match the referenced effective schedule assignment and cannot be classified as `work` on a configured weekly-rest date.

`expected_minutes` is stored explicitly because future policy/break rules may make expected payable/attendance minutes different from a naive clock-time subtraction. Stage 3B therefore does not hard-code an uncontrolled duration formula.

## Weekly rest

A `weekly_rest` result:

- references the effective schedule assignment;
- is valid only when the business date's weekday exists in that assignment's canonical `weekly_off_days_json`;
- references effective published `SA-WORK-SCHEDULE` and `SA-WEEKLY-REST` policy versions;
- carries zero expected work minutes.

The caller cannot classify an arbitrary date as weekly rest using a free-form day label.

## Approved leave exclusion

An `approved_leave` work-obligation result is accepted only when:

- the referenced leave request belongs to the same canonical employee;
- request status is `approved`;
- the work date is inside the request's date range;
- `cancelled_date_keys_json` is a valid array;
- the specific work date has not been partially cancelled/restored;
- the effective schedule assignment does not classify that date as weekly rest.

This enforces the Golden Journey invariant:

> approved leave removes the corresponding work obligation, while weekly rest remains a separate fact.

Stage 3B does not yet calculate annual/sick/unpaid leave payroll treatment. That remains Leave Policy / Payroll work.

## Holiday and approved exception boundaries

The schema contains explicit `holiday` and `approved_exception` result kinds so Attendance and Payroll do not need separate ad-hoc exclusion concepts.

However, the audited repository does not yet contain a canonical Holiday Kernel or fully typed Exception Workflow Kernel.

Therefore Stage 3B does **not** bootstrap or infer holiday/exception rows from generic request data. Future resolver work must validate those source keys against their canonical domain owner before producing the result.

## Policy references

A referenced work-schedule policy version must:

- exist in `hr_policy_versions`;
- use policy key `SA-WORK-SCHEDULE`;
- be non-draft;
- be effective on the work date.

A referenced weekly-rest policy version must satisfy the same contract for `SA-WEEKLY-REST`.

Draft, wrong-family, expired or future-not-yet-effective policy versions cannot be used in a resolution snapshot.

## Immutable revisions

Work obligations are never edited in place.

A changed source fact or backdated correction creates the next revision:

```text
employee + work_date + revision 1
-> revision 2 supersedes revision 1
-> revision 3 supersedes revision 2
```

Rules:

- revision 1 cannot supersede another row;
- revision N must supersede revision N-1 for the same employee/date;
- one historical row may be superseded only once;
- rows cannot be updated or deleted;
- each resolver command uses a globally unique idempotency key.

`hr_current_work_obligations` selects the highest revision for each employee/date.

This preserves the exact historical work-obligation result that an older payroll revision may have referenced.

## Attendance and Payroll contract

Target flow after later runtime cutover:

```text
canonical source facts
-> server Work Obligation resolver
-> employee_work_obligations revision
-> Attendance daily resolution references obligation revision
-> Payroll references the same obligation/attendance versions
```

Attendance and Payroll must not independently reconstruct schedule/rest/leave logic after cutover.

This satisfies the Golden Journey requirement that the same schedule-derived work obligation is consumed by both domains.

## Existing client helper

`client/src/lib/workSchedule.ts` currently provides useful compatibility behavior for:

- weekday normalization
- weekly-off recognition
- date range generation
- filtering caller-provided excluded dates

Stage 3B does not delete or rewrite that helper.

It remains compatibility/UI behavior until the server resolver and API cutover are implemented. It must not become the canonical payroll-impacting calculation path.

## Integrity view

`hr_work_obligation_integrity_summary` exposes signals for:

- current unresolved obligations
- invalid revision links
- invalid schedule-policy references
- invalid weekly-rest-policy references
- current scheduled-work rows missing expected minutes

The database constraints/triggers prevent known invalid writes; the integrity view remains useful for reconciliation and migration/runtime health checks.

## Validation contract

`server/hr-work-obligation-kernel.test.ts` proves:

- migration does not fabricate work obligations
- scheduled work snapshots the effective schedule
- weekly rest is derived from canonical weekly-off configuration
- a configured weekly-rest date cannot be inserted as normal scheduled work
- approved leave must belong to the same employee and cover the business date
- partially cancelled leave dates cannot remove a work obligation
- draft/wrong-family schedule policy versions are rejected
- resolver input metadata must be a JSON object
- revision chains cannot skip history
- latest revision is selected as current
- previous revisions remain queryable
- historical rows cannot be updated or deleted
- duplicate idempotency keys are rejected
- integrity summary remains coherent

## Explicit exclusions

Stage 3B does **not** yet implement:

- server API/command that generates daily obligations
- automatic horizon generation for all employees
- canonical holiday calendar
- typed attendance exception workflow
- employment-period resolver for `not_employed`
- leave policy calculation
- Attendance daily-resolution cutover
- Payroll calculation cutover
- UI replacement
- Production migration deployment

Those are later stages after this schema contract is validated.

## Production gate

Migration `0019` is repository work only until explicitly approved for Production.

At this stage, migrations `0012` through `0019` remain subject to a separate Production D1 approval gate.
