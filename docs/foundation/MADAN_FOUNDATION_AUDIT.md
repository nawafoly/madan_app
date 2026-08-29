# MADAN Foundation Audit — Stage 0

Audit baseline: `main@27bc1e4e1356e2f6abef6a297cdc40afabc9383f`

Legend:
- `CURRENT` = observed in current repository/schema
- `TARGET` = required by MADAN System Constitution
- `GAP` = current state violates or does not yet satisfy target contract
- `LEGACY` = compatibility state that must not become the future architecture

## A. Current runtime map

```text
Firebase Auth
   |
   +-- legacy Firestore user/employee compatibility
   |
   +-- HR Core Worker ---------------------- HR_DB (D1: maedin-hr)
   |       |                                 accounts
   |       |                                 employees
   |       |                                 permissions
   |       |                                 leave / absences / requests
   |       |                                 payroll
   |       |                                 audit / other HR operations
   |       |
   |       +-- ATTENDANCE_DB binding
   |
   +-- Attendance Worker ------------------ Attendance D1
                                           work_zones
                                           attendance_records
                                           attendance_state
                                           attendance_monthly_summaries
```

## B. Current HR Core ownership

Observed in `workers/hr-migrations/0001_create_hr_core.sql`:

| Data | Current owner | Classification | Audit status |
|---|---|---|---|
| Roles | HR_DB | Master | CURRENT |
| Permission definitions | HR_DB | Master | CURRENT |
| Role permissions | HR_DB | Master | CURRENT |
| Accounts | HR_DB + Firebase/legacy compatibility | Master | LEGACY transition |
| Account permission overrides | HR_DB | Master | CURRENT |
| Employees | HR_DB with Firestore compatibility | Master | LEGACY transition |
| HR audit logs | HR_DB | Audit | CURRENT |
| HR migration runs | HR_DB | Operational metadata | CURRENT |

Observed account/employee integrity already enforced:

- `accounts.uid` primary key
- unique lower-case account email
- unique lower-case username
- `employees.id` primary key
- unique non-null `employees.auth_uid`
- employee `auth_uid` references account UID

Current gap:

- `accounts.linked_employee_id` is indexed but not constrained to a valid employee.
- Employee-account creation remains cross-system and can partially succeed unless the application workflow verifies/reconciles the D1 link.

## C. Current employee master gaps

Observed employee columns mix multiple domains in one row:

- identity/profile
- employment status
- leave balance snapshot
- base salary
- allowances
- insurance deduction
- schedule
- attendance-zone assignment
- salary deductions JSON
- personal/employment JSON compatibility payloads

`GAP`: current employee row is functioning as both employee master and storage bucket for separate domain states.

Target decomposition without breaking existing reads:

```text
Employee Master
Employment Assignment / History
Compensation Terms / History
GOSI Profile / History
Schedule Assignment / History
Leave Ledger
Deduction / Obligation Ledger
```

Compatibility columns remain projections until cutover is complete.

## D. Leave

Observed current schema:

- `employee_leave_requests`
- request status defaults to `pending`
- leave type defaults to `annual`
- deducted/restored balance counters
- partial cancellation date keys
- reviewer/decider metadata
- current leave balance adjustment ledger in `employee_leave_balance_adjustments`

Observed current frontend types/statuses:

```text
pending
approved
rejected
cancelled
```

Observed leave types:

```text
annual
sick
emergency
unpaid
other
```

`CURRENT`: approved leave dates are already consumed by attendance calculation helpers.

`GAP`:

- entitlement/accrual remains represented primarily by employee balance/snapshot plus adjustments rather than a complete entitlement ledger.
- Saudi policy version/effective date is not first-class.
- sick-leave statutory/project buckets are not represented as a policy ledger.
- leave workflow states are too coarse for full requested lifecycle/approval/reconciliation semantics.

## E. Schedule and time

Observed `client/src/lib/workSchedule.ts`:

- one utility for weekday normalization
- weekly off-day resolution
- date-range generation
- work-date generation excluding weekly rest and caller-provided excluded dates

Observed schedule shape remains primarily:

```text
startTime
endTime
weeklyOffDays
```

`GAP`:

- no effective-dated schedule assignment model in the audited schema.
- no canonical server-owned `Work Obligation` entity/projection.
- schedule calculation exists in client libraries and employee compatibility fields.
- holidays/exceptions are caller-provided rather than resolved by a single authoritative kernel.

## F. Attendance

Observed Attendance D1 schema:

- `work_zones`
- append-style `attendance_records`
- current `attendance_state`
- `attendance_monthly_summaries`

`CURRENT` strengths:

- raw attendance records are distinct from current attendance state.
- location validation facts are stored with attendance events.
- monthly summary is a derived projection.

Observed current client attendance calculation:

- Riyadh timezone explicitly used.
- derives expected/actual hours, lateness, early exit, overtime, missing hours.
- recognizes approved leave, weekly rest, holidays, explicit absences.

`GAP`:

- payroll-impacting attendance resolution is implemented in client TypeScript.
- overtime candidate is derived from net extra time without a separate eligibility/approval policy object.
- no versioned attendance policy/grace period in audited core schema.
- no server-owned canonical daily attendance resolution identified in current Stage 0 audit.

## G. Payroll

Observed schema `employee_payroll_records` currently stores:

- payroll period
- base salary and allowances
- attendance summary/snapshot
- schedule snapshot
- absence/delay deductions
- overtime bonus
- insurance deduction
- salary deductions JSON
- salary advance settlement references
- gross/final salary
- Mudad document metadata
- lifecycle metadata added later: finalized/reopened/revision/paid

Current lifecycle values observed in shared types:

```text
draft
finalized
paid
```

`CURRENT` strengths:

- one employee/month uniqueness constraint where employee_id is present.
- revision and reopen reason exist.
- attendance and schedule snapshots are retained.
- paid/finalized actor/timestamps exist.

Critical `GAP` identified in `client/src/lib/employeePayroll.ts`:

```text
hourlyRate = baseSalary / expectedWorkHours
overtime = hourlyRate * multiplier
DEFAULT_OVERTIME_MULTIPLIER = 1.5
```

This does not encode the already-adopted Madan/Malikat Saudi overtime contract separating actual wage and the additional 50% basic-wage component. Payroll computation is also client-owned.

Additional gaps:

- `insurance_deduction` is a scalar, not a versioned GOSI calculation/profile.
- salary deductions are generic JSON items rather than typed policy-governed obligations.
- no first-class payroll obligation ledger identified.
- no first-class policy/wage version references identified.
- current lifecycle is narrower than target OPEN -> CALCULATING -> REVIEW -> APPROVED -> LOCKED -> PAYABLE -> PAID -> RECONCILED -> CLOSED.
- no explicit stale-input detection from wage/schedule/attendance/GOSI versions identified.

## H. GOSI / Saudi compliance

`GAP`: no dedicated GOSI domain tables or versioned Saudi policy catalog were identified in audited HR migrations 0001/0002/0003/0007/0009.

Current compatibility field:

```text
employees.insurance_deduction
employee_payroll_records.insurance_deduction
```

Target requires:

```text
GOSI profile/history
GOSI wage history
policy version
employee contribution calculation
employer contribution calculation
calculation evidence/snapshot
```

Basic Wage, Actual/Fixed Wage, and GOSI Wage must become distinct canonical concepts.

## I. Employee requests

Observed service request types in shared types:

```text
attendance_correction
permission
overtime
salary_advance
resignation
exit_reentry
letter
```

`GAP`: heterogeneous business processes share a generic request table/lifecycle. Each process eventually requires domain-specific validation and effects while a common workflow envelope may remain shared.

## J. Authorization

Observed current server model includes:

- role definitions
- role permissions
- per-account allow/deny permission overrides
- server-side role/permission checks in HR Worker routes

`CURRENT`: authorization is not UI-only.

`GAP`: approval matrix / segregation-of-duties rules are not yet first-class policy entities.

## K. Audit / evidence

Observed `hr_audit_logs` contains:

- actor
- action
- entity
- before/after JSON
- IP
- user agent
- timestamp

`GAP` target additions:

- correlation/request ID
- command/workflow reference
- policy version reference
- evidence reference
- explicit reason for all sensitive overrides

## L. Repository structure risks

Stage 0 identified oversized mixed-responsibility surfaces that must be treated as refactor candidates rather than new business-rule homes:

- `client/src/pages/admin/Employees.tsx`
- `client/src/pages/admin/Settings.tsx`
- `client/src/pages/employee/Profile.tsx`
- `client/src/pages/hr/Payroll.tsx`
- `client/src/pages/hr/Attendance.tsx`
- `workers/hr-core-worker.js`
- `workers/attendance-worker.js`

Repository hygiene candidates observed on `main`:

- tracked `.env.local`
- tracked `.tmp` artifacts
- tracked Wrangler local-state artifacts
- debug/diff artifacts

No secret contents are reproduced in this audit.

## M. Priority gap register

### P0 — integrity / money / compliance

1. Formalize canonical employee/account invariant and reconciliation.
2. Move payroll computation out of UI and replace generic overtime formula with approved Saudi wage contract.
3. Introduce Basic / Actual / GOSI wage distinction and effective dating.
4. Introduce versioned Saudi employment policy catalog.
5. Introduce GOSI profile/calculation model.
6. Introduce typed payroll obligations/deductions and idempotent settlement.
7. Introduce canonical schedule/work-obligation resolver.
8. Introduce canonical attendance daily resolution consumed by payroll.

### P1 — lifecycle coherence

1. Employment history/assignment model.
2. Leave entitlement/consumption ledger.
3. Overtime approval -> obligation/comp-time flow.
4. Deduction/discipline workflows and evidence.
5. Expanded payroll lifecycle and stale-input detection.
6. Final settlement/offboarding workflow.
7. Approval matrix.

### P2 — resilience / governance

1. Event/outbox journal.
2. command idempotency/correlation IDs.
3. reconciliation/system-health dashboard.
4. policy/invariant contract tests.
5. repository hygiene cleanup.
6. split oversized UI/worker files along domain boundaries after ownership is fixed.

## N. Stage gates

### Gate 0 — Foundation documentation

- [x] System Constitution created
- [x] Current HR/attendance/payroll schema audited
- [x] Initial gap register created
- [ ] Source-of-Truth Matrix committed
- [ ] Invariant Catalog committed
- [ ] Policy Catalog skeleton committed
- [ ] Employee Golden Journey committed

### Gate 1 — No behavior change

Foundation documentation only. No D1 migration, deploy, or production behavior change.

### Gate 2 — First implementation slice

First implementation slice may start only after Gate 0 artifacts are committed and reviewed. Recommended first slice: identity/employee integrity + reconciliation, because this is a prerequisite for every downstream domain and directly closes the incident class observed during the legacy employee backfill.
