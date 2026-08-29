# MADAN Source of Truth Matrix

Status: Foundation contract
Baseline: `main@27bc1e4e1356e2f6abef6a297cdc40afabc9383f`

## Legend

- `CANONICAL NOW` — current authoritative owner
- `CANONICAL TARGET` — target authoritative owner after migration
- `PROJECTION` — derived/rebuildable read model
- `LEGACY COMPAT` — temporary compatibility copy; never authoritative
- `EXTERNAL AUTHORITY` — external identity/service whose result is referenced by Madan

| Business fact | Current owner | Target owner | Secondary copies / projections | Rule |
|---|---|---|---|---|
| Authentication credential / Firebase UID | Firebase Auth | Identity Kernel with Firebase Auth as external auth provider while retained | HR account `uid` reference | Firebase authenticates; HR business state does not live in Firebase claims alone |
| Account role | HR_DB `accounts.role_key` | Identity/Authorization Kernel | UI session projection | Server-owned |
| Account active state | HR_DB `accounts.is_active` | Identity Kernel | legacy Firestore compatibility if still required | Must not be inferred from employee status |
| Account permission overrides | HR_DB `account_permissions` | Authorization Kernel | UI effective-permission projection | Server-enforced |
| Employee master identity | HR_DB `employees` | Employee Master Kernel | legacy Firestore employee doc during transition | D1 is canonical; Firestore is not allowed to overwrite valid D1 |
| Account -> employee link | HR_DB account/employee relationship | Identity + Employee invariant | legacy linked IDs | Must be reconciled and verified |
| Employee personal profile | HR_DB employee canonical fields | Employee Master Kernel | legacy Firestore compatibility | One canonical mutation path |
| Avatar selection | HR employee profile | Employee Master/Profile policy | static asset catalog | No name-based gender inference; explicit selection or neutral policy |
| Employment status | HR_DB employee employment state | Employment Kernel history | employee current-state projection | Effective-dated; separate from account active state |
| Employment start/end | HR_DB compatibility fields / employment JSON | Employment Kernel history | employee current projection | Effective-dated |
| Position/title | HR_DB compatibility fields | Employment/Organization Kernel | employee projection | Effective-dated |
| Department/branch/team | HR_DB compatibility fields where present | Organization + Employment Assignment | employee projection | IDs/master-data references, not uncontrolled strings |
| Reporting manager | Not canonicalized in audited core | Organization/Employment Assignment | org chart projection | Effective-dated |
| Basic Wage | `employees.base_salary` compatibility/current input | Compensation Kernel effective-dated terms | employee current projection; payroll snapshots | Distinct from Actual Wage and GOSI Wage |
| Actual / Fixed Wage | Not first-class in audited core | Compensation Kernel | payroll snapshot | Required separate concept |
| GOSI Wage | Not first-class in audited core | GOSI Kernel | payroll/GOSI snapshot | Required separate concept |
| Housing allowance | employee compatibility fields | Compensation Kernel effective-dated component | payroll snapshot | Typed pay component |
| Transport allowance | employee compatibility fields | Compensation Kernel effective-dated component | payroll snapshot | Typed pay component |
| Other allowances | employee compatibility fields | Compensation Kernel effective-dated component ledger | payroll snapshot | Typed component, not opaque total only |
| Work schedule | employee `shift_*` / schedule JSON + client resolver | Schedule Kernel | resolved work-obligation projection | One canonical resolver |
| Weekly rest | employee compatibility schedule fields | Schedule/Policy Kernel | work-obligation projection | Must be effective-dated |
| Work zones | Attendance D1 `work_zones` | Attendance/Location Policy Kernel | UI projection | Server-owned |
| Raw attendance event | Attendance D1 `attendance_records` | Attendance Kernel event ledger | monthly/daily projections | Append-oriented evidence |
| Current check-in state | Attendance D1 `attendance_state` | Attendance Kernel projection | UI state | Derived from events |
| Attendance monthly summary | Attendance D1 `attendance_monthly_summaries` | Attendance projection | payroll snapshot | Rebuildable, never event source |
| Daily attendance/payroll resolution | Client calculation currently participates | Attendance + Time + Policy Kernel | payroll input snapshot | Must move server-side/canonical |
| Attendance correction | generic service request + current operations | Attendance Workflow Kernel | audit/event projection | Controlled command + evidence |
| Leave request workflow | HR_DB `employee_leave_requests` | Leave Workflow Kernel | UI projection | State transitions server-owned |
| Leave entitlement | `employees.leave_balance` snapshot + adjustments | Leave Ledger / Policy Kernel | current balance projection | Balance must be reproducible |
| Leave balance adjustment | HR_DB `employee_leave_balance_adjustments` | Leave Ledger | current balance snapshot | Immutable adjustment history |
| Approved leave dates | HR leave request state | Leave Kernel | attendance work-obligation exclusion projection | Approved leave affects attendance automatically |
| Sick-leave bucket state | Not first-class | Leave Policy/Ledger Kernel | balance/period projection | Versioned Saudi policy |
| Explicit absence entry | HR_DB `employee_absences` | Attendance/HR Exception Kernel | payroll resolution | Must not conflict with approved leave |
| Overtime candidate | client attendance calculation currently derives | Time/Attendance Kernel | UI preview | Not automatically payable |
| Approved overtime | generic service request currently possible | Overtime Workflow Kernel | payroll obligation / comp-time ledger | Approval + policy required |
| Compensatory time | Not first-class | Time Entitlement Ledger | leave/time projection | Separate from cash overtime |
| Salary advance request | generic service request | Obligation/Advance Workflow Kernel | payroll settlement reference | Typed financial obligation |
| Deduction | employee JSON / payroll JSON / requests depending type | Deduction & Obligation Ledger | payroll snapshot | Typed, policy-governed, evidence-backed |
| Disciplinary fine | Not dedicated in audited core | Discipline/Deduction Ledger | payroll obligation | Distinct from attendance deduction |
| Judicial deduction | Not dedicated in audited core | Deduction & Obligation Ledger | payroll obligation | Distinct policy/cap |
| GOSI profile | Not first-class | GOSI Kernel | employee/payroll projection | Versioned/effective-dated |
| GOSI employee contribution | scalar insurance deduction currently used | GOSI calculation ledger | payroll line | Derived from GOSI policy/input version |
| GOSI employer contribution | Not identified as first-class | GOSI calculation ledger | accounting/report projection | Must be retained separately |
| Payroll record | HR_DB `employee_payroll_records` | Payroll Kernel | documents/reports projections | Server-calculated lifecycle record |
| Payroll attendance snapshot | payroll record JSON/fields | Payroll immutable/revision snapshot | none | References canonical attendance resolution/version |
| Payroll schedule snapshot | payroll record JSON | Payroll snapshot | none | References canonical work obligation/version |
| Payroll calculation | Client helper currently computes material values | Payroll Kernel | UI preview only | Must move server-side |
| Payroll lifecycle | HR_DB record with draft/finalized/paid + revision metadata | Payroll Workflow Kernel | UI projection | Expand to controlled lifecycle |
| Payroll payment/settlement | HR_DB paid metadata | Money/Settlement Kernel | payroll status projection | Idempotent + concurrency-safe |
| Mudad document | payroll record metadata + R2 | Payroll Evidence Kernel / R2 object | UI links | Evidence, not payroll truth |
| Employee documents/files | HR core/R2 flows | Evidence/Document Kernel | UI projection | Versioned/replacement history |
| HR audit | HR_DB `hr_audit_logs` | Audit Kernel | health/report projections | Append-oriented |
| Domain event journal | Not established in audited core | Event Journal / Outbox | downstream projections | Immutable/idempotent processing |
| Policy definitions | scattered constants/behavior | Policy Kernel | cached evaluation projection | Versioned + effective-dated |
| Approval matrix | role checks + workflow-specific logic | Approval Policy Kernel | UI action availability | Server-owned |
| System integrity status | manual diagnosis / endpoint checks | Reconciliation/System Health Kernel | admin dashboard | Proactive continuous checks |
| Firestore HR copies | Legacy writer/read compatibility | None after cutover | LEGACY COMPAT only | Must never overwrite valid canonical D1 rows |

## Cross-domain ownership rules

1. A domain may reference another domain's ID; it may not silently duplicate ownership of that domain's mutable business fact.
2. A projection is disposable and rebuildable.
3. A legacy compatibility copy is never chosen over canonical D1 merely because its `updatedAt` is newer.
4. A historical payroll/settlement record keeps the exact policy/input versions used; current employee values must not rewrite the past.
5. Any operation requiring writes to more than one durable boundary uses workflow/outbox/reconciliation semantics rather than assuming atomicity across systems.
6. New features must declare their source-of-truth row in this matrix before implementation.
