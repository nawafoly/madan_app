# MADAN Stage 1 — Identity Reconciliation Gate

## Scope

This gate governs reconciliation between legacy identity inputs and the canonical HR Core D1 identity graph.

D1 remains authoritative. Legacy Firestore or exported legacy snapshots are compatibility inputs only.

## Non-negotiable rules

1. Reconciliation is **missing-only**.
2. Existing canonical D1 identity rows are never overwritten by the reconciliation planner.
3. Duplicate business identifiers or identity collisions are a **STOP** condition.
4. Canonical integrity drift is a **STOP** condition before any missing-record action is considered executable.
5. Dry-run planning is the default and currently the only supported CLI mode.
6. `--apply` is deliberately rejected until a separately reviewed governed apply command exists.
7. A safe missing employee is created only as a complete account + employee identity pair.
8. Account UID, employee `auth_uid`, employee ID, `linked_employee_id`, and employee-profile enablement must agree.
9. Re-running the planner after a successful missing-pair creation must produce no new action for that identity.
10. Reconciliation must not mutate the source or canonical snapshots while planning.

## Canonical identity integrity classes

The planner evaluates the same six deployed Stage 1 drift classes exposed by `hr_identity_integrity_summary`:

- `staff_profile_without_employee`
- `broken_linked_employee_id`
- `link_auth_mismatch`
- `employee_without_auth_uid`
- `employee_without_account`
- `reverse_link_mismatch`

It additionally fails closed on duplicate account UIDs, duplicate employee IDs, and duplicate employee auth UIDs.

## Planner contract

`workers/hr-identity-reconciliation.js` exports:

- `evaluateIdentityIntegrity(...)`
- `planMissingOnlyIdentityReconciliation(...)`

A plan contains:

- `mode: "dry-run"`
- `policy: "missing-only-no-overwrite"`
- `blocked`
- integrity summaries
- conflicts
- candidate actions
- executable actions

If any conflict exists, `blocked=true` and `actions=[]` even when some candidate actions would otherwise be safe. This is intentional fail-closed behavior.

## Dry-run CLI

```bash
node scripts/reconcile-hr-identity-snapshots.mjs --source <source.json> --canonical <canonical.json> --output <plan.json>
```

Snapshot shape:

```json
{
  "accounts": [],
  "employees": []
}
```

The CLI performs no Cloudflare, Firebase, Firestore, or repository writes.

## Apply gate

A future apply command must not be enabled until all of the following are true:

- the dry-run plan is unblocked;
- canonical integrity is clean before apply;
- the action set is reviewed;
- every write has explicit preconditions;
- account + employee creation is atomic or compensating-repair-safe;
- post-write reconciliation proves the canonical graph is clean;
- audit evidence records actor, input snapshot identity, plan, result, and time.

Until that command is reviewed, Stage 1 reconciliation remains intentionally dry-run only.
