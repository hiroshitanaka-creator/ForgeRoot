# ForgeRoot Thread Handoff: after T018

Date: 2026-04-18 JST

Recommended next target: **T019 Executor sandbox harness**

## Current state

ForgeRoot has completed the deterministic intake, planning, and pre-execution branch/worktree manifest boundary:

- T015 issue intake classifier
- T016 Plan Spec DSL
- T017 planner runtime
- T018 branch/worktree manager

T018 introduced `packages/executor` as the executor-side package seed. It is intentionally manifest-only and does not run `git`, create branches, add worktrees, edit files, create commits, open PRs, run tests, or invoke a sandbox.

## Key files from T018

- `packages/executor/src/worktree.ts`
- `packages/executor/src/index.ts`
- `packages/executor/tests/worktree.test.mjs`
- `packages/executor/README.md`
- `docs/specs/t018-validation-report.md`

## T018 API surface

```ts
createBranchWorktreePlan(plan, options)
validateBranchWorktreePlan(plan)
validateChangedPaths(plan, changedPaths)
BRANCH_WORKTREE_MANAGER_CONTRACT
```

## Invariants preserved

- Git remains the source of truth.
- PR remains the only evolution transport path.
- One accepted task becomes one Plan Spec.
- One ready Plan Spec becomes at most one branch/worktree manifest.
- Default branch writes remain forbidden.
- Workflow, policy, and network paths remain immutable unless a separate elevated task approves them.

## Recommended T019 boundary

T019 should add an executor sandbox harness around the T018 manifest without performing real production mutation. It should prepare a bounded execution request/manifest for a sandbox runner and validate that commands, environment, path scope, and output artifacts stay within the Plan Spec and T018 branch/worktree contract.

Suggested out of scope for T019:

- PR composer
- audit report generation
- real GitHub mutation
- workflow mutation
- policy mutation
- network/federation behavior
- self-evolution
