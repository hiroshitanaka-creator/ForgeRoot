# @forgeroot/executor

Executor-side primitives for ForgeRoot.

## T018 branch/worktree manager

T018 adds a deterministic branch/worktree preparation layer between Planner output and later sandbox execution.

Main exports:

- `createBranchWorktreePlan(plan, options)`
- `validateBranchWorktreePlan(plan)`
- `validateChangedPaths(plan, changedPaths)`
- `BranchWorktreePlan` and related schema types
- `BRANCH_WORKTREE_MANAGER_CONTRACT`

The manager consumes a Plan Spec-like object and produces a manifest only. It does not run `git`, create branches, add worktrees, edit files, create commits, open PRs, or run tests.

The manifest enforces:

- branch names under `forge/<phase>/<task-id>-<slug>`
- no direct writes to the default branch
- one Plan Spec becomes at most one branch/worktree manifest
- ephemeral worktree paths under a runtime-owned root
- explicit mutable and immutable path guards
- human execution approval before elevated plans can prepare a branch/worktree manifest

## Local development

```bash
cd packages/executor
timeout 20 tsc -p tsconfig.json
node --test --test-force-exit tests/*.test.mjs
```
