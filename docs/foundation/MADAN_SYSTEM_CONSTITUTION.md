# MADAN System Constitution

Status: Foundation contract
Branch: `architecture/madan-operating-kernel-foundation`
Base: `main@27bc1e4e1356e2f6abef6a297cdc40afabc9383f`

## 1. Mission

Madan is one coherent Saudi business operating system. HR, identity, employment, attendance, scheduling, leave, payroll, GOSI, deductions, employee requests, documents, audit, and reporting must operate from shared business contracts rather than page-local rules.

Malikat is the reference implementation for previously established operational behavior and Saudi employment/payroll rules. Madan may reuse proven business rules and user journeys, but must not copy legacy architecture or propagate legacy code.

## 2. Non-negotiable architecture rules

1. Every business fact has one canonical owner.
2. `Person`, `Account`, `Employee`, and authentication identity are distinct concepts with explicit links.
3. No sensitive business rule is owned by React/UI code.
4. No domain may maintain an independent interpretation of schedule, attendance, leave, wage, or payroll truth.
5. Derived values are reproducible from canonical facts, events, policies, and effective-dated inputs.
6. Financial and employment history is never destroyed to represent a correction; use revision, reversal, supersession, adjustment, or cancellation as appropriate.
7. Every sensitive mutation is authorized, auditable, attributable, and idempotent where replay is possible.
8. Partial multi-system operations must be detectable and recoverable.
9. Legacy Firestore compatibility is not a second source of truth.
10. Legal/compliance policy is versioned and effective-dated.

## 3. Operating Kernel

The Madan Operating Kernel consists of:

- Identity Kernel
- Organization Kernel
- Employment Kernel
- Time Kernel
- Schedule Kernel
- Attendance Kernel
- Leave Kernel
- Saudi Employment & Compliance Kernel
- GOSI Kernel
- Money / Payroll Kernel
- Deduction & Obligation Kernel
- Policy Kernel
- Workflow Kernel
- Command Kernel
- Event Journal
- Authorization Kernel
- Evidence Kernel
- Audit Kernel
- Reconciliation Kernel
- System Health Kernel
- Master Data & Configuration Kernel

Product screens are clients of these kernels; they do not redefine them.

## 4. Identity graph

Canonical relationship:

```text
Person
  ├─ Auth Identity (Firebase UID while Firebase Auth remains active)
  ├─ Account
  │   ├─ role
  │   ├─ permissions
  │   └─ active state
  └─ Employee (when the person is employed)
      ├─ employment
      ├─ schedule
      ├─ attendance
      ├─ leave
      ├─ payroll
      └─ compliance
```

Required invariants:

- One active employee may link to at most one authentication UID.
- One authentication UID may link to at most one employee.
- A staff/HR/accountant/admin/owner account marked as employee-profile-enabled must resolve to a valid employee record.
- Account activation and employment status are separate facts and may not silently overwrite each other.
- Employee linkage must be verified before an employee-account creation workflow reports success.

## 5. Organization model

Target hierarchy:

```text
Organization
  └─ Legal Entity
      └─ Branch / Location
          └─ Department
              └─ Team
                  └─ Position
                      └─ Employee Assignment
```

An employee assignment is effective-dated and carries manager/reporting line, location, department, position, cost center when applicable, and employment state.

## 6. Effective dating

The following values must support history rather than destructive overwrite:

- employment status
- employment contract
- position / title
- department / branch
- manager
- basic wage
- actual/fixed wage
- GOSI wage
- allowances
- work schedule
- weekly rest
- policy assignment
- role / privileged authorization when audit-sensitive

Every calculation for a historical period must resolve the version effective during that period.

## 7. Time and schedule contract

There is one canonical schedule resolver.

Inputs may include:

- employee assignment
- normal work schedule
- effective date
- weekly rest
- approved schedule exceptions
- approved leave
- official/company holiday
- temporary assignment

Outputs form the employee's `Work Obligation` for the date or period.

Attendance, leave, payroll, reports, and performance may consume the resolved work obligation; they must not independently reconstruct it.

## 8. Attendance contract

Raw attendance events are evidence, not payroll decisions.

Canonical flow:

```text
Attendance Event
  -> validated event
  -> daily attendance resolution
  -> policy evaluation
  -> approved corrections/exceptions
  -> payroll-impacting attendance result
```

Required distinctions include:

- present
- incomplete
- late
- early exit
- absent
- approved leave
- weekly rest
- holiday
- overtime candidate
- approved overtime

An approved leave day cannot simultaneously remain an unexplained absence for payroll purposes.

## 9. Leave contract

Leave is a workflow plus a ledger, not a mutable balance field alone.

Canonical balance concept:

```text
Opening balance
+ accrual / entitlement
+ approved adjustments
- consumed leave
+ restored/cancelled leave
= current derived balance
```

Current `employees.leave_balance` may remain as a compatibility/snapshot value during migration, but the target source of truth is a reproducible leave ledger.

Saudi policy families already established in the Malikat reference must be carried as versioned policies, including annual leave, sick leave, weekly rest, unpaid leave, and compensatory leave.

## 10. Saudi Employment & Compliance Kernel

Saudi employment behavior must be implemented as versioned policy contracts, not scattered constants.

Policy records must support:

- `policy_key`
- version
- effective-from / effective-to
- scope
- parameters
- calculation method
- attendance impact
- payroll impact
- evidence requirements
- approval requirements
- superseded policy reference

Established policy families to formalize include:

- annual leave entitlement/accrual
- sick leave buckets: 30 full-pay / 60 at 75% / 30 unpaid under the already-adopted project rule
- weekly rest
- working-time rules
- overtime
- compensatory time
- salary deduction controls
- disciplinary fines
- salary advances / employer loans
- judicial deductions
- termination / final settlement
- GOSI treatment

These project rules are implementation references and must be represented by policy versions so a future policy change does not rewrite historical calculations.

## 11. Wage model

Madan must never collapse the following into one field:

- Basic Wage
- Actual / Fixed Wage
- GOSI Wage

Allowances and pay components must also be separately identified and effective-dated.

A payroll calculation must record which wage versions were used.

## 12. GOSI model

Target GOSI employment profile includes:

- employee reference
- applicability / registration state
- nationality/classification inputs needed by configured policy
- GOSI wage
- employee contribution result
- employer contribution result
- effective dates
- policy version
- evidence / external reference when available

Payroll consumes the GOSI result. Payroll must not reinterpret GOSI policy independently.

## 13. Overtime contract

Raw extra attendance time is not automatically financial overtime.

```text
Resolved work obligation
+ actual attendance
-> overtime candidate
-> eligibility policy
-> approval
-> cash overtime OR compensatory time
-> payroll obligation / time ledger
```

The adopted project overtime rule must distinguish actual wage from basic wage and calculate the overtime component using the established Saudi payroll contract rather than a generic `hourly_rate * 1.5` shortcut.

If required work-hour or wage inputs are missing, overtime/payroll calculation must fail closed instead of guessing.

## 14. Payroll and money contract

Payroll is a financial lifecycle, not a UI calculation.

Target lifecycle:

```text
OPEN
-> CALCULATING
-> REVIEW
-> APPROVED
-> LOCKED
-> PAYABLE
-> PAID
-> RECONCILED
-> CLOSED
```

Reopening a locked/finalized payroll requires explicit authorization, reason, revision increment, and audit.

Each monetary line must identify its origin:

- base/actual wage
- allowance
- GOSI deduction/contribution
- attendance deduction
- absence deduction
- overtime
- salary advance
- disciplinary deduction
- judicial deduction
- manual approved adjustment
- final settlement item

Payroll records must snapshot or reference effective versions of wage, policy, schedule, attendance resolution, leave impact, GOSI, and approved obligations.

Paid obligations must be protected against duplicate settlement by idempotency and database-level concurrency controls.

## 15. Deduction and discipline contract

Deductions are typed obligations, not free-form amounts.

Required metadata:

- category/type
- reason
- source event/request
- policy version
- evidence
- amount / rate / cap inputs
- approval trail
- payroll period
- settlement status

Attendance deductions, disciplinary fines, salary advances/employer loans, judicial deductions, and other deductions remain distinct categories with separate policy limits and accounting meaning.

## 16. Workflow contract

Sensitive processes are explicit state machines. State transitions happen through commands, not arbitrary field edits.

Examples:

- HireEmployee
- ActivateEmployee
- SuspendEmployee
- TerminateEmployee
- ChangeEmploymentTerms
- ChangeWage
- AssignSchedule
- SubmitLeaveRequest
- ApproveLeave
- CancelLeave
- CorrectAttendance
- ApproveOvertime
- CreateDeduction
- ApproveDeduction
- CalculatePayroll
- ApprovePayroll
- ReopenPayroll
- MarkPayrollPaid
- ReconcilePayroll
- CompleteFinalSettlement

Each command follows:

```text
Authenticate
-> Authorize
-> Validate invariants
-> Resolve effective policy
-> Apply atomic canonical mutation
-> Record audit/evidence
-> Emit domain event/outbox
-> Reconcile downstream projections
```

## 17. Event journal

Domain events are immutable facts used to connect domains without hidden cross-page writes.

Initial event families:

- EmployeeCreated
- EmployeeActivated
- EmploymentChanged
- WageChanged
- EmployeeSuspended
- EmployeeTerminated
- ScheduleAssigned
- AttendanceRecorded
- AttendanceCorrected
- LeaveRequested
- LeaveApproved
- LeaveRejected
- LeaveCancelled
- OvertimeApproved
- DeductionApproved
- GosiProfileChanged
- PayrollCalculated
- PayrollApproved
- PayrollReopened
- PayrollPaid
- PayrollReconciled
- FinalSettlementCompleted

Event handling must be idempotent.

## 18. Authorization contract

Authorization is server-enforced.

Effective permissions derive from role permissions plus explicit account overrides. UI visibility is presentation only and is never sufficient authorization.

Sensitive actions may additionally require approval-matrix rules independent of ordinary CRUD permission.

## 19. Audit and evidence

For sensitive changes record:

- actor
- action/command
- entity
- before
- after
- reason
- policy version when relevant
- approval/evidence references
- timestamp
- request/correlation id

A correction must remain explainable years later.

## 20. Reconciliation and system health

Madan must proactively detect integrity drift.

Minimum health checks:

- employee-profile-enabled account without employee
- employee without expected account/auth link
- conflicting account/employee linkage
- duplicate identifiers
- employee status inconsistent with future schedule
- approved leave conflicting with unresolved absence
- orphan attendance identity
- stale payroll input versions
- payroll obligation settled more than once
- invalid leave ledger/snapshot
- GOSI-enabled profile without required wage/policy inputs
- payroll record missing required source evidence
- legacy sync pending/failed

Health states: `healthy`, `warning`, `critical`, `repair_required`.

## 21. Failure and recovery

Cross-system success may not be assumed.

Until legacy dependencies are removed, any flow that touches Firebase Auth, Firestore, D1, R2, or another external boundary must have:

- correlation/idempotency key
- durable workflow state or outbox
- retry policy
- reconciliation check
- visible failure status
- no silent partial success

The employee-account incident class `account exists / employee missing` is explicitly forbidden as an undetected terminal state.

## 22. Data classes

Every business datum is classified as one of:

- Master: authoritative current/historical business identity/configuration
- Ledger: append-oriented financial/entitlement history
- Event: immutable occurrence
- Workflow: mutable process state with controlled transitions
- Snapshot/Projection: derived, rebuildable representation
- Evidence: supporting artifact/reference

A snapshot/projection must never silently become the only source of truth.

## 23. UI boundary

Frontend responsibilities:

- collect input
- display state
- request commands
- render validation/domain errors

Frontend must not own canonical payroll, GOSI, leave entitlement, deduction limits, overtime eligibility, employment lifecycle, or authorization rules.

## 24. Testing contract

Required test classes:

- unit policy tests
- domain invariant tests
- command/state-transition tests
- API authorization tests
- database constraint/concurrency tests
- reconciliation tests
- historical/effective-date tests
- end-to-end Golden Employee Journey tests

A build passing alone is not a business-correctness gate.

## 25. Golden Employee Journey

```text
Candidate
-> Hire approved
-> Auth identity/account created
-> Employee master created and linked
-> Employment terms effective
-> GOSI/compliance profile effective
-> Schedule assignment
-> Attendance/leave/service requests
-> OT/deductions/obligations
-> Payroll lifecycle
-> Employment changes / transfers
-> Termination decision
-> Last working day
-> Leave/attendance reconciliation
-> Final settlement
-> GOSI/offboarding completion state
-> Access closure
-> Archive
```

Each step must preserve traceability into the next.

## 26. Migration principle

Migration proceeds domain-by-domain:

1. document current owner and writers
2. define target contract and invariants
3. create compatibility adapter if needed
4. backfill missing canonical data without overwriting valid canonical rows
5. reconcile
6. switch reads
7. switch writes
8. remove legacy writer
9. lock with tests/constraints

No blind full-dataset UPSERT is permitted against an already-live canonical domain.

## 27. Governance

Any future feature that introduces a second source of truth, duplicate calculation runtime, unversioned legal rule, UI-owned sensitive calculation, destructive history rewrite, silent partial success, or bypass of the command/audit boundary requires architecture review before merge.
