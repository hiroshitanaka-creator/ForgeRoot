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

## T017 planner runtime

T017 adds `run.ts`, the deterministic runtime bridge from T015 intake to T016 Plan Spec creation.

Main exports:

- `runPlanner(input)`
- `PlannerRunInput`
- `PlannerRunResult`
- `PlannerRunStatus`
- `PLANNER_CONTEXT_RECIPE`
- `PLANNER_BOUNDED_OUTPUT_CONTRACT`

`runPlanner` accepts one of three source shapes:

- `github_webhook` — converts a webhook-like payload through the intake classifier.
- `intake_input` — classifies an already-normalized `IntakeInput`.
- `task_candidate` — creates a Plan Spec from an already-accepted `NormalizedTaskCandidate`.

The runtime never edits files, creates branches, creates commits, opens PRs, runs tests, or generates audit reports. It returns at most one valid Plan Spec per run. Ignored, blocked, escalated, or invalid inputs return no plan and include deterministic reasons plus an audit trail.

## Local development

```bash
cd packages/planner
timeout 20 tsc -p tsconfig.json
node --test --test-force-exit tests/*.test.mjs
```
