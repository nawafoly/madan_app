# MADAN Invariant Catalog

Status: Foundation contract

Invariant failures are business-integrity failures, not UI warnings.

| ID | Invariant | Enforcement target | Severity |
|---|---|---|---|
| IDN-001 | An employee-profile-enabled staff/HR/accountant/admin/owner account resolves to exactly one valid employee | DB + command + reconciliation | CRITICAL |
| IDN-002 | One employee `auth_uid` maps to at most one account identity | DB unique constraint | CRITICAL |
| IDN-003 | One authentication UID maps to at most one employee | DB unique constraint | CRITICAL |
| IDN-004 | Account active state and employee employment status are not aliases | Domain command | HIGH |
| IDN-005 | Employee creation cannot report success before canonical employee/account linkage is verified | Workflow | CRITICAL |
| IDN-006 | Legacy Firestore data cannot overwrite an existing valid canonical HR D1 employee/account during reconciliation | Import/reconciliation guard | CRITICAL |
| EMP-001 | Employment periods for the same assignment dimension cannot overlap illegally | DB/domain validation | HIGH |
| EMP-002 | Terminated/offboarded employee cannot receive a new future schedule without explicit rehire/reactivation workflow | Schedule command | HIGH |
| EMP-003 | Wage/employment changes are effective-dated; historical payroll cannot be recalculated against silently overwritten current values | Domain model | CRITICAL |
| SCH-001 | A date/employee has one canonical resolved work obligation | Schedule kernel | CRITICAL |
| SCH-002 | Weekly rest and approved holiday/exemption cannot be charged as unexplained absence | Schedule/attendance resolution | CRITICAL |
| ATT-001 | Raw attendance events are immutable evidence except controlled correction/supersession metadata | Attendance DB/command | HIGH |
| ATT-002 | Approved leave cannot coexist with unresolved payroll absence for the same employee/date | Attendance/leave reconciliation | CRITICAL |
| ATT-003 | Payroll may consume only canonical attendance resolution, not page-local recomputation | API boundary | CRITICAL |
| ATT-004 | Incomplete check-in/out state is not silently treated as complete paid work | Attendance resolver | HIGH |
| LEV-001 | Leave balance is reproducible from opening entitlement/accrual/adjustments/consumption/restoration | Leave ledger | CRITICAL |
| LEV-002 | Cancelled/restored leave cannot be deducted twice | Ledger idempotency | CRITICAL |
| LEV-003 | Sick-leave pay bucket calculation uses the policy version effective for the covered period | Policy/leave kernel | CRITICAL |
| LEV-004 | Weekly rest is not deducted from annual leave entitlement | Leave/schedule kernel | HIGH |
| OVT-001 | Attendance extra time is an overtime candidate, not a payable overtime obligation | Overtime workflow | CRITICAL |
| OVT-002 | Payable overtime requires eligibility + approval unless an explicitly configured auto-approval policy applies | Policy/workflow | CRITICAL |
| OVT-003 | Overtime calculation must distinguish Actual/Fixed Wage from Basic Wage under the adopted Saudi project contract | Payroll policy | CRITICAL |
| OVT-004 | Missing required work-hours/wage inputs causes calculation failure, never guessed fallback | Payroll policy | CRITICAL |
| PAY-001 | Basic Wage, Actual/Fixed Wage, and GOSI Wage are distinct canonical values | Compensation/GOSI schema | CRITICAL |
| PAY-002 | Every payroll monetary line has a typed source and policy/evidence reference where required | Obligation ledger | CRITICAL |
| PAY-003 | Finalized/locked/paid payroll cannot be silently edited in place | Payroll workflow/DB | CRITICAL |
| PAY-004 | Backdated correction uses revision/reversal/adjustment; prior settled history remains traceable | Payroll ledger | CRITICAL |
| PAY-005 | One obligation/payment idempotency key cannot settle more than once | DB uniqueness/transaction | CRITICAL |
| PAY-006 | Concurrent payroll settlement cannot produce duplicate payment | DB transaction/constraint | CRITICAL |
| PAY-007 | Payroll calculation records wage, schedule, attendance, leave, GOSI and policy versions used | Payroll snapshot | HIGH |
| PAY-008 | A payroll record with stale critical input versions cannot transition to approved/payable without recalculation or explicit governed override | Workflow | CRITICAL |
| DED-001 | Attendance deduction, disciplinary fine, advance/loan, judicial deduction and other deduction classes are not interchangeable | Deduction model | CRITICAL |
| DED-002 | Deduction must carry reason/source/amount/status and required approval/evidence | Command validation | HIGH |
| DED-003 | Policy limits are evaluated before approval/settlement | Policy kernel | CRITICAL |
| GOS-001 | GOSI-enabled/applicable employee profile must have required effective GOSI wage/policy inputs before payroll approval | GOSI/payroll gate | CRITICAL |
| GOS-002 | Employee and employer GOSI contribution results are stored separately | GOSI ledger | HIGH |
| GOS-003 | Historical GOSI calculation is tied to policy/wage version effective for that payroll period | GOSI snapshot | CRITICAL |
| AUT-001 | UI visibility never substitutes for server authorization | API | CRITICAL |
| AUT-002 | Sensitive approval may require approval-matrix checks beyond ordinary manage permission | Workflow/policy | HIGH |
| AUD-001 | Sensitive mutation records actor/action/entity/before/after/time and reason when override/correction applies | Audit kernel | HIGH |
| AUD-002 | Domain correction cannot delete the evidence trail that justified the original state | Audit/evidence | CRITICAL |
| EVT-001 | Domain event processing is idempotent | Event/outbox | HIGH |
| EVT-002 | Projection failure does not roll back an already-committed canonical fact; it becomes retry/reconciliation work | Event/outbox | HIGH |
| REC-001 | Partial cross-system workflow must end as success, failed, or repair-required; never undetected partial success | Workflow/reconciliation | CRITICAL |
| REC-002 | System health detects account/employee orphan/link drift automatically | Reconciliation | CRITICAL |
| DAT-001 | Snapshot/projection data is rebuildable and cannot become sole canonical history | Architecture review | HIGH |
| DAT-002 | Duplicate business identifiers violate integrity and block mutation rather than choosing a winner silently | DB/domain | CRITICAL |

## Required CI contract groups

- IdentityIntegrity
- EmploymentEffectiveDating
- CanonicalSchedule
- AttendanceLeaveCoherence
- SaudiLeavePolicy
- SaudiOvertimePolicy
- GosiCalculation
- DeductionLimits
- PayrollLifecycle
- PayrollIdempotency
- PayrollConcurrency
- HistoricalReproducibility
- ReconciliationRepair
