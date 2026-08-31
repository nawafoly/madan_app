# MADAN Stage 3A — Versioned Policy Kernel

Status: Foundation contract
Scope: additive schema foundation; no Production migration or policy-value activation in this stage

## Objective

Establish one canonical registry for versioned, effective-dated business policies so payroll, attendance, leave, GOSI, schedule, deduction and approval workflows stop depending on uncontrolled UI constants or overwritten current configuration.

Stage 3A closes the structural part of the Foundation Audit P0 gap:

- introduce a versioned Saudi employment policy catalog;
- resolve policy by business date;
- preserve the exact version used by historical calculations;
- fail closed later when a financial/compliance-sensitive calculation requires a policy version that does not exist.

This stage creates the policy registry. It does **not** publish legal rates, contribution percentages, thresholds, grace periods or other concrete Saudi policy values.

## Source-of-truth transition

Before Stage 3A, policy behavior is represented by a mixture of:

- foundation documentation;
- client/server constants;
- workflow-specific checks;
- current employee/payroll snapshots;
- legacy behavior.

Target ownership:

- `hr_policy_definitions` owns stable policy-family identity;
- `hr_policy_versions` owns concrete versioned/effective-dated policy contracts;
- downstream calculations reference the exact policy version they resolved;
- UI constants remain non-authoritative.

## Stable policy definitions

Migration `0018_policy_kernel.sql` seeds the policy keys already declared by `MADAN_POLICY_CATALOG.md`.

It seeds **definitions only**. Definitions identify a governed policy family and its intended consumer. They do not contain enforceable rates or legal parameters.

Saudi HR policy families include employment lifecycle, probation, schedule, weekly rest, annual/sick/unpaid leave, attendance, late/early treatment, overtime, GOSI, deductions, payroll lifecycle/correction and final settlement.

Operational policy families include identity linkage, avatar fallback, approval matrix, idempotency, reconciliation, audit/evidence and retention.

## Policy version contract

Each `hr_policy_versions` row contains:

- stable policy key;
- numeric version;
- half-open effective interval `[effective_from, effective_to)`;
- lifecycle status;
- scope JSON;
- parameters JSON;
- calculation contract JSON;
- approval contract JSON;
- evidence contract JSON;
- attendance effect JSON;
- payroll effect JSON;
- optional supersession lineage;
- source/reason;
- publish and close actor metadata;
- immutable creation timestamps.

All contract JSON surfaces must be JSON objects.

## Lifecycle

Supported lifecycle states:

```text
draft -> published -> superseded
                   -> retired
```

A draft may be edited or deleted because it has not become a business fact.

Once published, the policy's business contents are immutable. A published row may only be closed by assigning `effective_to` and moving to `superseded` or `retired` with close metadata.

A superseded or retired version cannot be edited or deleted.

This provides the audit guarantee required for historical payroll and compliance calculations.

## Effective dating

Finalized policy versions use half-open periods:

```text
[effective_from, effective_to)
```

For one `policy_key`:

- finalized periods may not overlap;
- adjacent periods are valid;
- only one finalized open-ended period may exist;
- future policy versions may be published without affecting the current business date early.

`hr_current_policy_versions` resolves finalized versions effective today.

`hr_resolvable_policy_versions` exposes all non-draft versions for business-date resolution.

Downstream kernels must resolve against the relevant business date, not merely the server's current date.

## Supersession lineage

A version may identify `supersedes_version_id`.

The referenced version must:

- exist;
- belong to the same `policy_key`;
- have a lower numeric version.

Lineage does not replace effective-period validation. Both lineage and non-overlap rules apply.

## No invented Saudi policy values

Stage 3A intentionally creates zero rows in `hr_policy_versions` during migration.

This is a critical safety property.

The repository contains policy-family names and some previously adopted project contracts, but a database migration must not silently turn incomplete documentation into Production legal/compliance configuration.

Concrete versions will be introduced only through a governed policy-loading stage that identifies:

- source/authority;
- exact parameters;
- effective date;
- calculation contract;
- approval/evidence requirements;
- actor/reason;
- downstream migration/cutover impact.

## Downstream references

The canonical policy version ID/key will later be retained by calculations such as:

- work-obligation resolution;
- attendance daily resolution;
- leave accrual/pay buckets;
- overtime eligibility/pay;
- GOSI employee/employer contribution;
- attendance deductions;
- disciplinary/judicial deductions;
- aggregate deduction guard;
- payroll calculation and correction;
- final settlement.

A finalized/paid historical calculation must never be recomputed merely because a newer policy version now exists.

## Integrity summary

`hr_policy_integrity_summary` exposes:

- invalid effective ranges;
- overlapping finalized policy periods;
- multiple current versions for one policy key;
- definitions with no currently effective version;
- invalid supersession lineage;
- finalized versions missing publication metadata.

`policy_definitions_without_current_version` is expected to be non-zero immediately after Stage 3A because this migration deliberately does not publish policy values.

It is migration/configuration debt, not an instruction to fabricate defaults.

## Compatibility and cutover

Stage 3A does not yet modify:

- client payroll formulas;
- attendance calculation behavior;
- leave calculation behavior;
- GOSI calculations;
- employee compatibility columns;
- payroll snapshots;
- approval workflow behavior.

Those consumers will be moved to the policy kernel in later slices after approved versions exist.

## Validation contract

`server/hr-policy-kernel.test.ts` verifies:

- all stable policy definitions are seeded;
- no concrete policy version is fabricated by migration;
- drafts are editable;
- publishing makes business contents immutable;
- overlapping finalized periods are rejected;
- adjacent effective periods are accepted;
- a future version does not affect today's resolution early;
- supersession must reference an older version of the same policy;
- contract JSON must be object-shaped;
- finalized rows cannot be deleted;
- draft rows may be deleted;
- integrity counters remain coherent.

## Production gate

Migration `0018` is repository work only until explicitly approved for Production.

At this point migrations `0012` through `0018` remain subject to a separate Production D1 approval gate.

No Production database write or runtime cutover is authorized by merging Stage 3A.
