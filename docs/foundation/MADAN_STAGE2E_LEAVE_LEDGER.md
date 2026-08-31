# MADAN Stage 2E — Canonical Leave Ledger

Status: Foundation contract  
Scope: additive schema foundation; no Production migration or API/UI cutover in this stage

## Objective

Establish an append-only canonical leave balance ledger that can reproduce an employee's leave balance from durable business facts instead of treating `employees.leave_balance` as historical truth.

This stage implements the schema foundation required by:

- `LEV-001` — leave balance must be reproducible from opening entitlement/accrual/adjustments/consumption/restoration.
- `LEV-002` — cancelled/restored leave cannot be deducted twice.
- `DAT-001` — snapshot/projection data cannot become the sole canonical history.

## Source-of-truth transition

Before Stage 2E:

- `employees.leave_balance` is the current compatibility snapshot.
- `employee_leave_balance_adjustments` stores legacy adjustment evidence when such operations occur.
- `employee_leave_requests` stores workflow state and legacy deducted/restored day snapshots.

Target ownership:

- `employee_leave_ledger_entries` owns canonical leave-balance mutations.
- `employees.leave_balance` remains a compatibility/current projection during transition.
- `employee_leave_requests` remains the leave workflow record, not the balance ledger itself.
- `employee_leave_balance_adjustments` remains legacy evidence and is not replayed as canonical history without a trustworthy opening state.

## Production preflight observed on 2026-08-31

Read-only D1 inspection reported:

- employees: `29`
- employees with null `leave_balance`: `19`
- employees with negative `leave_balance`: `0`
- employees with explicit zero `leave_balance`: `0`
- observed known balance range: `9` to `21` days
- legacy leave balance adjustments: `0`
- inconsistent legacy adjustments: `0`
- leave requests: `4`
  - pending annual: `1`
  - rejected annual: `1`
  - rejected sick: `2`
- deducted days across those requests: `0`
- restored days across those requests: `0`
- invalid request ranges: `0`
- latest legacy adjustment snapshot mismatches: `0`

These observations support a non-destructive current-state bootstrap. They do **not** provide enough evidence to fabricate historical accrual or entitlement periods.

## Bootstrap semantics

Migration `0016_leave_ledger.sql` uses a strict cutover rule:

1. If `employees.leave_balance` is non-null at migration time, create exactly one `opening_balance` ledger entry for that employee.
2. The opening entry is effective on the migration date (`date('now')`).
3. The entry is **not** backdated to hire date or any guessed entitlement date.
4. If `employees.leave_balance` is null, create no opening entry. Unknown remains unknown.
5. Existing leave requests are not converted into deductions/restorations merely because they exist.
6. Existing legacy adjustment rows are not replayed because doing so without the historical opening balance could double-count or invent history.

The bootstrap captures only the observed current balance at cutover.

## Canonical ledger model

`employee_leave_ledger_entries` stores one immutable business fact per leave-balance mutation.

Supported entry types:

- `opening_balance`
- `accrual`
- `grant`
- `consumption`
- `restoration`
- `adjustment`
- `expiration`
- `reversal`

Every row contains:

- canonical employee ID
- business effective date
- typed balance delta in days
- mandatory idempotency key
- optional leave-request reference
- optional policy version
- optional evidence reference
- source and reason metadata
- actor and creation timestamp

## Balance semantics

Canonical current balance is the sum of ledger deltas whose `effective_date <= date('now')`.

The model intentionally supports future-dated entries without allowing them to affect today's balance early.

A known zero balance is representable with an `opening_balance` of `0`.

A null compatibility balance is different from a known zero balance and is therefore not bootstrapped.

## Immutability

Ledger rows cannot be updated or deleted.

A correction must be represented by a new business fact:

- an `adjustment`, or
- a `reversal` that explicitly points at the original ledger entry.

This preserves historical traceability and prevents silent balance rewrites.

## Reversal contract

A reversal:

- must use `entry_type = 'reversal'`;
- must reference exactly one existing ledger entry;
- must belong to the same employee as the original entry;
- must have the exact opposite balance delta;
- may reverse a given original entry only once.

This provides a durable anti-double-restoration control for leave cancellation/correction flows.

## Idempotency

Every ledger entry has a globally unique `idempotency_key`.

A workflow retry using the same business operation key cannot create a second financial/time-entitlement effect.

Future leave commands should derive stable idempotency keys from the workflow operation, for example:

- request approval consumption
- cancellation restoration
- manual governed adjustment
- policy accrual run

## Leave request references

A request-backed ledger entry may reference `employee_leave_requests.id` only when that request is canonically linked to the same `employee_id`.

Legacy request rows with missing canonical employee linkage are not accepted as canonical ledger write sources until reconciled.

This prevents one employee's request from mutating another employee's leave balance.

## Current-state projection

`hr_current_leave_balances` provides the current canonical balance per employee from ledger entries effective today or earlier.

It is a rebuildable projection over immutable ledger history.

## Integrity summary

`hr_leave_ledger_integrity_summary` exposes transition and integrity signals including:

- known compatibility balance without a canonical ledger balance
- employees whose compatibility balance remains unknown
- compatibility/current-ledger balance mismatch
- count of legacy adjustment rows
- legacy requests where restored days exceed deducted days
- request/employee reference mismatches

`employees_with_unknown_leave_balance` is informational migration debt, not an invented zero balance.

## Compatibility period

This stage does not remove or rewrite:

- `employees.leave_balance`
- `employee_leave_balance_adjustments`
- existing leave request columns
- current UI/API leave mutation paths

Until command/API cutover is implemented, those fields remain compatibility surfaces.

If the legacy application mutates `employees.leave_balance` after the ledger migration without adding the corresponding canonical ledger entry, `compat_balance_mismatch` is expected to expose that drift.

## Explicit exclusions

Stage 2E does **not** yet implement:

- Saudi annual leave accrual policy
- sick-leave paid/unpaid buckets
- automatic weekly-rest exclusion from leave days
- leave request approval command cutover
- automatic consumption/restoration ledger writes from request transitions
- leave policy version engine
- payroll/attendance integration
- Production migration deployment

Those require later policy/workflow stages.

## Validation contract

`server/hr-leave-ledger.test.ts` verifies:

- known compatibility balance bootstraps as one opening ledger fact
- null compatibility balance is not fabricated
- current balance is reproducible from ledger deltas
- leave consumption reduces canonical balance
- duplicate idempotency keys are rejected
- cross-employee request references are rejected
- reversal restores the original delta
- the same source entry cannot be reversed twice
- invalid reversal amount is rejected
- historical ledger rows cannot be edited or deleted
- future-dated entries do not affect current balance early
- integrity summary remains coherent

## Production gate

Migration `0016` is repository work only until explicitly approved for Production.

At the time of this stage, migrations `0012` through `0016` remain subject to a separate Production D1 approval gate.
