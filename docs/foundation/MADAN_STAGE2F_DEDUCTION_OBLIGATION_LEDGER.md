# MADAN Stage 2F — Canonical Deduction & Obligation Ledger

Status: Foundation contract
Scope: additive schema foundation; no Production migration or API/UI/payroll cutover in this stage

## Objective

Establish a canonical, append-only financial obligation and deduction ledger for employee money obligations that must survive payroll cycles and remain historically auditable.

This stage implements the target ownership already declared in the source-of-truth matrix:

- salary advance → Obligation/Advance Workflow Kernel
- deduction → Deduction & Obligation Ledger
- disciplinary fine → Discipline/Deduction Ledger
- judicial deduction → Deduction & Obligation Ledger

Payroll records remain settlement/calculation snapshots. They do not become the historical owner of an obligation merely because a deduction amount appears in a payroll record.

## Production preflight observed on 2026-08-31

Read-only D1 inspection reported:

- employees: `29`
- missing `salary_deductions_json`: `0`
- invalid `salary_deductions_json`: `0`
- employees with non-empty salary deduction arrays: `0`
- current employee deduction items: `0`
- current service requests: `4`
  - attendance correction approved: `1`
  - attendance correction pending: `1`
  - permission pending: `1`
  - permission rejected: `1`
- those four requests contain no monetary amount
- payroll records: `4`
- payroll `total_salary_deductions` snapshot total: `100`
- payroll salary advance deduction snapshot total: `0`
- payroll absence deduction snapshot total: `3429.77`
- payroll delay deduction snapshot total: `1326.51`
- invalid payroll deduction JSON rows: `0`
- invalid salary-advance request-ID JSON rows: `0`

The observed payroll deductions are historical payroll calculation snapshots. They do not establish a trustworthy outstanding obligation principal and therefore are not replayed into the new ledger.

## Bootstrap semantics

Migration `0017_deduction_obligation_ledger.sql` intentionally performs **no financial bootstrap**.

Reason:

1. No current employee salary deduction items were present in Production preflight.
2. No amount-bearing salary-advance request was observed.
3. Historical payroll deduction scalars and JSON are payroll snapshots, not sufficient evidence to reconstruct original obligation principal, prior settlements, reversals, or outstanding balance.
4. Replaying those payroll snapshots would risk creating duplicate liabilities or fictional outstanding debt.

Before any later Production migration apply, the read-only preflight must be repeated. If live financial obligations appear before cutover, they require explicit reconciliation rather than silent inference.

## Canonical obligation model

`employee_financial_obligations` owns the immutable identity and provenance of an employee financial obligation.

Supported obligation types:

- `salary_advance`
- `manual_deduction`
- `disciplinary_fine`
- `judicial_deduction`
- `attendance_absence`
- `attendance_delay`
- `other`

An obligation records:

- canonical employee ID
- typed obligation category
- currency
- optional source service request
- optional policy version
- optional evidence reference
- source/reason metadata
- actor and creation timestamp

The obligation row does **not** store a mutable outstanding balance or mutable status. Those are derived from immutable ledger facts.

## Canonical obligation ledger

`employee_obligation_ledger_entries` stores every monetary mutation against an obligation.

Supported entry types:

- `charge` — establishes the obligation principal; positive
- `deduction` — payroll settlement; negative and must reference a payroll record
- `payment` — external/non-payroll settlement; negative
- `waiver` — governed amount release; negative
- `adjustment` — governed non-zero correction fact
- `reversal` — exact opposite of one prior ledger entry

Each ledger row includes:

- obligation ID
- canonical employee ID
- business effective date
- signed amount delta
- optional payroll record reference
- optional reversal target
- globally unique idempotency key
- optional policy/evidence references
- source/reason metadata
- actor and creation timestamp

## Balance semantics

Current outstanding obligation balance is the sum of ledger deltas whose `effective_date <= date('now')`.

The schema prevents a new entry from making the obligation balance negative at that entry's effective date.

This blocks over-deduction and over-payment while preserving future-dated settlements without affecting today's balance early.

A future-dated payment/deduction remains visible as a future ledger fact but is excluded from the current balance until effective.

## Payroll settlement contract

A canonical payroll `deduction` ledger entry:

- must reference `employee_payroll_records.id`;
- must reference a payroll record belonging to the same employee as the obligation;
- carries a stable idempotency key so payroll retry/concurrency cannot settle the same obligation twice.

Historical payroll fields such as:

- `total_salary_deductions`
- `salary_advance_deduction`
- `absence_deduction`
- `delay_deduction`
- `salary_deductions_json`

remain payroll snapshots. They are not rewritten or imported as canonical obligation history in this stage.

## Request linkage

An obligation may reference `employee_service_requests.id` only when that request is already canonically linked to the same employee.

The source request may initialize an obligation workflow later, but Stage 2F does not alter service-request state transitions.

This prevents a request belonging to one employee from generating debt for another employee.

## Immutability

Both obligation identity rows and ledger rows are immutable.

Existing rows cannot be updated or deleted.

Corrections must be represented as additional auditable ledger facts, primarily:

- `adjustment`, or
- `reversal`.

No financial history is silently rewritten.

## Reversal contract

A reversal:

- must use `entry_type = 'reversal'`;
- must reference one existing ledger entry;
- must belong to the same obligation and employee;
- must carry the exact opposite amount;
- may reverse a given source entry only once.

If reversing a charge would cause an already-settled obligation to become negative, prior settlements must first be reversed or otherwise reconciled. The ledger will reject a negative effective balance.

## Idempotency

Every obligation ledger entry requires a globally unique `idempotency_key`.

Examples of future command keys:

- obligation initial charge
- payroll obligation installment
- external repayment
- disciplinary/judicial deduction
- governed waiver
- reversal/correction

Retries with the same operation key cannot create a second monetary effect.

## Current-state projection

`hr_current_employee_obligations` derives:

- current balance
- current/future ledger entry counts
- derived status:
  - `pending_effective`
  - `open`
  - `settled`

The projection is rebuildable from immutable canonical facts.

## Integrity summary

`hr_deduction_obligation_integrity_summary` exposes:

- obligations without an initial charge
- negative current balances
- obligation/ledger employee mismatches
- payroll/ledger employee mismatches
- count of legacy employee deduction JSON items
- invalid legacy employee deduction JSON
- amount-bearing service requests not yet represented by an obligation
- historical payroll records containing deduction snapshots

The payroll snapshot count is informational migration evidence, not an instruction to recreate those deductions as outstanding debt.

## Compatibility period

Stage 2F does not remove or rewrite:

- `employees.salary_deductions_json`
- `employee_service_requests.amount`
- payroll deduction scalar fields
- payroll deduction JSON
- salary-advance request ID snapshots
- current payroll/service request UI and API mutation paths

Those remain compatibility and historical snapshot surfaces until later command/payroll cutover stages.

## Explicit exclusions

Stage 2F does **not** yet implement:

- salary advance request approval command cutover
- installment schedule generation
- Saudi deduction caps/policy evaluation
- disciplinary workflow
- judicial deduction policy
- automatic attendance-deduction obligation creation
- automatic payroll settlement writes
- accounting/general-ledger posting
- UI/API mutation cutover
- Production migration deployment

Those require later policy/workflow and payroll-kernel stages.

## Validation contract

`server/hr-deduction-obligation-ledger.test.ts` verifies:

- legacy employee/payroll snapshots are not silently promoted into obligations
- same-employee request linkage
- one canonical positive charge establishes principal
- payroll deduction reduces outstanding balance
- duplicate idempotency keys are rejected
- over-settlement is rejected
- cross-employee payroll settlement is rejected
- exact reversal restores balance
- double reversal is rejected
- invalid reversal amount is rejected
- obligation and ledger history are immutable
- future settlement does not affect current balance early
- legacy compatibility and payroll snapshot signals remain visible in integrity reporting

## Production gate

Migration `0017` is repository work only until explicitly approved for Production.

At the time of this stage, migrations `0012` through `0017` remain subject to a separate Production D1 approval gate.
