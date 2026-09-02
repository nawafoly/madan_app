# MADAN Stage 3D — Canonical Overtime Workflow Kernel

Status: Foundation contract
Scope: additive schema foundation; no Production migration or Payroll runtime cutover in this stage

## Objective

Establish the governed boundary between **extra attendance time** and **payable overtime**.

The canonical chain is:

```text
Attendance Resolution overtime_candidate_minutes
-> Overtime Candidate
-> SA-OVERTIME-ELIGIBILITY policy
-> manual approval OR explicitly configured policy auto-approval
-> approved overtime outcome
-> later cash calculation OR compensatory-time entitlement command
```

Stage 3D implements the candidate and approval portion only.

## Required invariants

The foundation Invariant Catalog defines:

- `OVT-001` — attendance extra time is an overtime candidate, not a payable overtime obligation.
- `OVT-002` — payable overtime requires eligibility + approval unless an explicitly configured auto-approval policy applies.
- `OVT-003` — overtime calculation must distinguish Actual/Fixed Wage from Basic Wage under the adopted Saudi project contract.
- `OVT-004` — missing required work-hours/wage inputs causes calculation failure, never guessed fallback.

Stage 3D enforces `OVT-001` and the workflow portion of `OVT-002` while deliberately leaving the monetary calculation for a later Payroll/Time stage.

## Source-of-truth boundary

The Source of Truth Matrix already declares:

- overtime candidate — Time/Attendance Kernel
- approved overtime — Overtime Workflow Kernel
- compensatory time — Time Entitlement Ledger
- payroll monetary result — Payroll/Obligation path

Therefore neither Attendance Resolution nor Overtime Workflow owns an overtime cash amount.

## Why migration `0021` bootstraps zero rows

Migration `0021_overtime_workflow_kernel.sql` creates no historical overtime candidates or approvals.

That is intentional because a valid candidate requires:

1. a canonical current Attendance Resolution;
2. positive `overtime_candidate_minutes` from that resolution;
3. the exact effective `SA-OVERTIME-ELIGIBILITY` policy version;
4. governed approval evidence when manual approval is required.

Existing legacy payroll overtime fields are payroll snapshots and cannot be safely replayed as canonical workflow history.

## `employee_overtime_candidates`

Each immutable candidate stores:

- canonical employee ID
- business/work date
- candidate revision
- exact Attendance Resolution ID
- exact positive candidate minutes
- eligibility result
- exact eligibility policy version
- approval mode
- optional settlement preference (`cash` or `comp_time`)
- eligibility input/evidence JSON objects
- superseded-candidate lineage
- globally unique idempotency key
- audit/source metadata

### Candidate source invariant

A candidate can be inserted only when its Attendance Resolution:

- belongs to the same employee;
- covers the same business date;
- is the current Attendance Resolution revision for that employee/date;
- has `resolution_kind = attended`;
- has positive `overtime_candidate_minutes`;
- exposes exactly the same candidate-minute value.

The application cannot submit arbitrary overtime minutes.

## Candidate revisions

Attendance correction may change the overtime candidate.

The workflow preserves history:

```text
Attendance Resolution r1 -> Overtime Candidate r1
Attendance correction -> Attendance Resolution r2
                         -> Overtime Candidate r2 supersedes candidate r1
```

Rules:

- revision 1 has no predecessor;
- revision N supersedes exactly revision N-1 for the same employee/date;
- prior candidate rows are immutable;
- current candidate is the highest revision.

Approval events belong to the exact candidate revision that was reviewed. If corrected attendance creates a new candidate revision, approval must be resolved for the new candidate rather than silently carrying forward the old approval.

## Eligibility states

### `eligible`

Requires an effective, non-draft `SA-OVERTIME-ELIGIBILITY` policy version.

Approval mode is either:

- `manual`
- `policy_auto`

### `ineligible`

Requires an effective eligibility policy version and uses `approval_mode = blocked`.

No approval workflow may be opened.

### `unresolved`

Used when required policy/input evidence is insufficient or contradictory.

It uses `approval_mode = blocked` and creates no payable result.

## Auto approval

`policy_auto` is intentionally exceptional.

The exact effective `SA-OVERTIME-ELIGIBILITY` policy version must explicitly expose:

```json
{
  "autoApproval": true
}
```

inside `approval_contract_json`.

This flag is an operational approval contract, not a statutory rate or formula.

The database retains the exact policy version used. The server command remains responsible for resolving the policy scope and all other eligibility/approval inputs.

## `employee_overtime_approval_events`

Approval history is append-only.

Supported events:

```text
manual eligible:
approval_requested -> approved | rejected | cancelled

policy-auto eligible:
auto_approved
```

Rules:

- event sequence is linear per candidate;
- sequence 1 has no predecessor;
- later event points to the immediately previous event;
- blocked candidates cannot enter the approval workflow;
- manual approve/reject/cancel decisions retain a human actor;
- `auto_approved` must not impersonate a human actor;
- approval rows cannot be updated or deleted;
- event idempotency keys are globally unique.

## Current workflow projection

`hr_current_overtime_workflow` combines:

- current candidate revision;
- latest approval event for that exact candidate;
- derived workflow state.

Derived states include:

- `blocked`
- `ineligible`
- `eligible_unsubmitted`
- `policy_auto_pending`
- `pending_approval`
- `approved`
- `rejected`
- `cancelled`

This view is a projection. Candidate and approval history remain the canonical records.

## No payable overtime in Stage 3D

The Stage 3D schema deliberately has no:

- overtime pay amount
- payable amount
- payable overtime minutes
- overtime bonus
- comp-time balance
- direct Payroll settlement record

An approved workflow result only proves that the candidate passed eligibility and approval.

### Cash path

A later command must resolve:

- the exact approved Overtime Candidate;
- effective `SA-OVERTIME-PAY` policy;
- effective Compensation terms;
- Basic Wage and Actual/Fixed Wage as distinct values;
- required work-hours inputs;
- idempotency/evidence.

Missing required inputs must fail closed under `OVT-003` / `OVT-004`.

### Comp-time path

A later Time Entitlement Ledger command must create the compensatory-time entitlement under the effective `SA-COMP-TIME` policy.

Choosing `comp_time` in this workflow does not itself mutate a leave/time balance.

## Integrity view

`hr_overtime_workflow_integrity_summary` exposes:

- unresolved current candidates
- invalid candidate revision links
- invalid Attendance Resolution references
- invalid eligibility policy references
- policy-auto candidates missing their auto-approval event
- auto-approval events whose policy did not explicitly allow auto approval
- manual approvals missing actor evidence

## Validation contract

`server/hr-overtime-workflow-kernel.test.ts` proves:

- migration creates no fabricated overtime history;
- candidate minutes must equal the canonical Attendance Resolution;
- manual eligibility uses the exact effective eligibility policy;
- manual approval requires request then actor-backed decision;
- direct approval is rejected;
- manual decisions without an actor are rejected;
- policy auto-approval is rejected unless explicitly enabled by policy;
- auto approval does not impersonate a human approver;
- attendance correction creates a new candidate revision without destroying prior approval history;
- candidate/event history is immutable;
- current workflow selects the latest candidate revision and latest event;
- integrity summary remains coherent;
- no payable monetary/time-entitlement field exists in the workflow schema.

## Explicit exclusions

Stage 3D does **not** yet implement:

- Saudi overtime cash formula
- wage-basis calculation
- approved overtime -> financial earning obligation conversion
- compensatory-time entitlement ledger
- Payroll calculation cutover
- typed UI/API workflow commands
- historical overtime backfill
- Production migration deployment

## Production gate

Migration `0021` is repository work only until explicitly approved for Production.

Migrations `0012` through `0021` remain under the separate Production D1 approval gate.
