# @forgeroot/planner

Planner-side primitives for ForgeRoot.

## T015 intake classifier

T015 adds deterministic intake classification before the full Planner runtime exists. The classifier turns issue, comment, and alert-like inputs into one of four dispositions:

- `accept` — normalized task candidate is safe to enqueue for later planning.
- `ignore` — not actionable for automation, usually because `forge:auto` is absent.
- `block` — explicitly unsafe, too broad, or blocked before planning.
- `escalate` — human review is required before planning.

Only items carrying the `forge:auto` label can become automatic planner candidates. The label must come from normalized labels; text inside an issue body or comment does not enable automation.

## T016 Plan Spec DSL

T016 adds `plan-schema.ts`, a deterministic one-task-one-PR contract between intake and execution.

Main exports:

- `createPlanSpecFromTaskCandidate(task)`
- `validatePlanSpec(plan)`
- `assertValidPlanSpec(plan)`
- `PlanSpec` and related schema types

The Plan Spec requires explicit `mutable_paths`, `immutable_paths`, `out_of_scope`, risk/approval linkage, and machine-checkable `acceptance_criteria`.

## Local development

```bash
cd packages/planner
TSC_NONPOLLING_WATCHER=1 tsc -p tsconfig.json --noEmit --pretty false --diagnostics
node --test --test-force-exit tests/*.test.mjs
```
