# MADAN Policy Catalog

Status: Foundation skeleton. Policies are versioned/effective-dated contracts. Business calculations must resolve a policy version rather than hard-code uncontrolled constants in UI pages.

## Policy record contract

```text
policy_key
version
effective_from
effective_to
scope
parameters
calculation_contract
approval_contract
evidence_contract
attendance_effect
payroll_effect
supersedes
status
```

## Saudi employment / HR policy families

| Policy key | Purpose | Existing project rule to preserve/formalize | Target consumer |
|---|---|---|---|
| SA-EMPLOYMENT-STATUS | Employment lifecycle transitions | active/probation/on-leave/suspended/terminated semantics become controlled transitions | Employment |
| SA-PROBATION | Probation rules/configuration | formalize from company/Saudi policy configuration | Employment |
| SA-WORK-SCHEDULE | Normal work obligation | one canonical resolver; no parallel schedule runtimes | Schedule/Attendance |
| SA-WEEKLY-REST | Weekly rest handling | weekly rest is distinct from annual leave | Schedule/Leave/Attendance |
| SA-ANNUAL-LEAVE | Annual entitlement/accrual | opening balance + accrual/entitlement + taken + adjustments | Leave/Payroll |
| SA-SICK-LEAVE | Sick leave pay buckets | adopted project contract: 30 full-pay / 60 at 75% / 30 unpaid | Leave/Payroll |
| SA-UNPAID-LEAVE | Unpaid leave payroll effect | explicit leave type and payroll impact | Leave/Payroll |
| SA-COMP-TIME | Compensatory leave/time | separate from cash overtime and represented in a time-entitlement ledger | Time/Leave/Payroll |
| SA-ATTENDANCE | Attendance resolution | resolve schedule, leave/rest/holiday, actual events, corrections and policy | Attendance |
| SA-LATE-EARLY | Late/early-exit treatment | policy-driven grace/impact; no page-local constants | Attendance/Payroll |
| SA-OVERTIME-ELIGIBILITY | What extra time qualifies | raw extra time is candidate only; approval/policy required | Attendance/Overtime |
| SA-OVERTIME-PAY | Cash overtime calculation | distinguish actual/fixed wage from basic wage; use adopted Saudi overtime contract; fail closed on missing required inputs | Payroll |
| SA-GOSI | GOSI profile/contributions | Basic Wage != Actual/Fixed Wage != GOSI Wage; store employee/employer results separately | GOSI/Payroll |
| SA-ATTENDANCE-DEDUCTION | Payroll deduction from attendance | typed deduction with source/evidence | Deduction/Payroll |
| SA-DISCIPLINARY-FINE | Disciplinary fine | distinct from attendance deduction and governed by dedicated limits/evidence | Discipline/Deduction |
| SA-EMPLOYER-LOAN | Employer loan/salary advance recovery | separate obligation class and applicable limits | Obligation/Payroll |
| SA-JUDICIAL-DEDUCTION | Judicial/court deduction | separate deduction class and policy limits | Deduction/Payroll |
| SA-DEDUCTION-AGGREGATE-LIMIT | Aggregate deduction guard | evaluate applicable aggregate limits before payroll approval | Deduction/Payroll |
| SA-PAYROLL-CYCLE | Payroll period and locking | controlled calculation/review/approval/settlement lifecycle | Payroll |
| SA-PAYROLL-CORRECTION | Backdated correction | revision/reversal/adjustment; no destructive rewrite | Payroll/Audit |
| SA-FINAL-SETTLEMENT | Termination settlement | reconcile remaining wage/leave/obligations before close | Employment/Payroll |

## Operational policy families

| Policy key | Purpose |
|---|---|
| MADAN-IDENTITY-LINK | Account/employee linkage invariant and recovery |
| MADAN-AVATAR-DEFAULT | Explicit male/female choice or neutral fallback; never infer gender from name |
| MADAN-APPROVAL-MATRIX | Actor/amount/type-dependent approvals |
| MADAN-IDEMPOTENCY | Replay/duplicate command behavior |
| MADAN-RECONCILIATION | Drift detection and repair classification |
| MADAN-AUDIT-EVIDENCE | Required audit/evidence fields by command |
| MADAN-DATA-RETENTION | Retention/archive policy by data class |

## Policy evaluation rules

1. Resolve policy by business date/effective period, not current date alone.
2. Historical payroll retains policy version used.
3. A policy version cannot be edited in place after it has affected finalized/paid payroll; create a superseding version.
4. Missing required policy inputs fail closed for financial/compliance-sensitive calculations.
5. Policy evaluation output is auditable and may be snapshotted into payroll/settlement records.
6. UI may preview a policy result only from a shared/server contract; UI constants are non-authoritative.
