# MADAN Golden Employee Journey

Status: Foundation contract

## Canonical journey

```text
CANDIDATE
  -> HIRE_APPROVED
  -> IDENTITY_PROVISIONING
  -> EMPLOYEE_MASTER_CREATED
  -> EMPLOYMENT_TERMS_EFFECTIVE
  -> GOSI_COMPLIANCE_READY
  -> SCHEDULE_ASSIGNED
  -> ACTIVE
  -> EMPLOYMENT_CHANGES / LEAVE / ATTENDANCE / REQUESTS
  -> PAYROLL_CYCLES
  -> TERMINATION_APPROVED
  -> LAST_WORKING_DAY
  -> FINAL_RECONCILIATION
  -> FINAL_SETTLEMENT
  -> ACCESS_CLOSED
  -> OFFBOARDED
  -> ARCHIVED
```

## 1. Hire approved

Command: `HireEmployee`

Required outputs:

- durable workflow/correlation ID
- approved employment terms
- employee identity inputs validated
- effective start date
- organizational assignment inputs

No account/employee record is considered fully provisioned yet.

## 2. Identity provisioning

Commands/events:

```text
ProvisionAuthIdentity
CreateAccount
AccountCreated
```

Gate:

- authentication UID available
- HR account canonical row available
- account role/permissions valid

Partial failure becomes `REPAIR_REQUIRED`, not success.

## 3. Employee master creation

Command: `CreateEmployee`

Required invariant:

```text
account.employee_profile_enabled = true
=> exactly one canonical employee is linked
```

Event: `EmployeeCreated`

Provisioning workflow verifies both directions of the identity relationship before terminal success.

## 4. Employment terms become effective

Command: `CreateEmploymentAssignment`

Effective-dated facts:

- legal/entity/branch assignment
- department/team/position
- manager
- employment status
- start/end dates when applicable
- Basic Wage
- Actual/Fixed Wage
- allowances
- working-time assignment

Event: `EmploymentChanged`

## 5. GOSI/compliance readiness

Command: `SetGosiProfile`

Required before payroll approval when applicable:

- effective GOSI profile
- effective GOSI Wage
- applicable policy version
- required employee classification inputs

Event: `GosiProfileChanged`

## 6. Schedule assignment

Command: `AssignSchedule`

Schedule Kernel produces date-specific `Work Obligation` from:

- effective schedule assignment
- weekly rest
- approved exception
- leave
- holiday
- policy

Event: `ScheduleAssigned`

## 7. Active employment runtime

### Attendance

```text
AttendanceRecorded
-> daily resolution
-> correction/exception workflow if needed
-> canonical payroll-impacting attendance result
```

### Leave

```text
SubmitLeaveRequest
-> review/approval
-> entitlement/ledger impact
-> work-obligation exclusion
-> attendance/payroll projection update
```

### Overtime

```text
extra attendance time
-> overtime candidate
-> eligibility policy
-> approval
-> cash obligation OR compensatory-time entitlement
```

### Deductions / advances / discipline

```text
source event/request
-> typed obligation
-> policy limits
-> approval/evidence
-> payroll settlement
```

## 8. Payroll cycle

```text
OPEN
-> resolve effective compensation
-> resolve GOSI
-> resolve canonical schedule/attendance/leave
-> resolve approved obligations
-> CALCULATING
-> REVIEW
-> APPROVED
-> LOCKED
-> PAYABLE
-> PAID
-> RECONCILED
-> CLOSED
```

Payroll stores/references versions for:

- Basic Wage
- Actual/Fixed Wage
- GOSI Wage
- compensation components
- policy
- schedule/work obligation
- attendance resolution
- leave impact
- GOSI result
- obligations/deductions

## 9. Employment change

Examples:

- wage change
- title/position change
- branch/department transfer
- manager change
- schedule change
- suspension/reactivation

Rule: create a new effective-dated state/period; do not destroy the historical state used by previous payroll periods.

## 10. Termination approved

Command: `TerminateEmployee`

Outputs:

- termination reason
- effective last working day
- future work obligations blocked/cancelled after effective date
- final reconciliation workflow opened
- access closure scheduled according to policy

Event: `EmployeeTerminated`

## 11. Final reconciliation

Reconcile at minimum:

- attendance through last working day
- approved/unresolved attendance corrections
- leave ledger/entitlement
- overtime/comp-time
- advances/loans
- deductions/obligations
- unpaid payroll obligations
- GOSI/offboarding state
- documents/evidence

No final settlement may close while a critical reconciliation item is unresolved without an explicit governed override.

## 12. Final settlement

Command: `CompleteFinalSettlement`

Requirements:

- versioned calculation
- typed settlement lines
- approval
- evidence
- idempotent payment/settlement
- audit

Event: `FinalSettlementCompleted`

## 13. Access closure / offboarding

Commands/events:

```text
CloseEmployeeAccess
EmployeeOffboarded
```

Account access state changes without rewriting historical employee/employment records.

## 14. Archive

Archived employment remains queryable for authorized historical payroll, audit, evidence, and compliance workflows.

## End-to-end acceptance contract

A Golden Journey test must prove:

1. hire cannot finish with a missing employee/account link;
2. schedule is the same work obligation consumed by attendance and payroll;
3. approved leave removes the corresponding absence obligation;
4. overtime candidate does not become payable without the configured eligibility/approval path;
5. payroll uses effective-dated compensation/GOSI/policy inputs;
6. paid payroll cannot be paid twice;
7. historical payroll remains reproducible after later wage/schedule changes;
8. termination prevents invalid future scheduling;
9. final settlement reconciles outstanding employee obligations;
10. audit/evidence can explain every sensitive transition.
