# T018 validation report — worktree / branch manager

Date: 2026-04-18 JST

## Scope

T018 adds the deterministic pre-execution boundary that converts one ready Plan Spec into one branch/worktree manifest.

Implemented paths:

- `packages/executor/src/worktree.ts`
- `packages/executor/src/index.ts`
- `packages/executor/tests/worktree.test.mjs`
- `packages/executor/README.md`
- `docs/specs/t018-validation-report.md`

Updated paths:

- `README.md`
- `.forge/README.md`

## Contract

The branch/worktree manager is manifest-only. It does not run `git`, create branches, add worktrees, edit files, create commits, open PRs, run tests, or invoke a sandbox.

The generated manifest records:

- `forge/<phase>/<task-id>-<slug>` branch naming
- default branch write protection
- ephemeral runtime-owned worktree path
- one Plan Spec to at most one branch/worktree manifest
- mutable and immutable path guards
- execution approval state for elevated plans

## Acceptance coverage

| Requirement | Coverage |
|---|---|
| One Plan Spec becomes at most one branch/worktree manifest | `createBranchWorktreePlan` returns one `BranchWorktreePlan` or no manifest |
| Default branch writes are forbidden | branch validation rejects unsafe/default targets and manifest guard sets `forbid_default_branch_write: true` |
| Branch names follow ForgeRoot naming | derived names use `forge/<phase>/<task-id>-<slug>` and parse `[P?][T???]` task titles |
| Worktrees are ephemeral runtime state | manifest records `ephemeral: true` and `cleanup: delete_after_pr_or_failure` |
| Mutable/immutable path boundaries are enforced | `validateChangedPaths` rejects immutable and out-of-scope paths |
| Elevated plans require human approval before branch prep | blocked manifests are returned until `approvedForExecution` and `approvalRef` are present |
| No git/file side effects | exported contract and audit trail explicitly mark manifest-only behavior |

## Validation commands

```bash
cd packages/planner
node --test --test-force-exit tests/*.test.mjs

cd ../executor
node --test --test-force-exit tests/*.test.mjs

cd ../..
node --check packages/executor/dist/worktree.js
node --check packages/executor/dist/index.js
node --check packages/planner/dist/run.js
```

## Results

- Planner regression tests: 23 pass / 0 fail
- Executor T018 tests: 10 pass / 0 fail
- `node --check packages/executor/dist/worktree.js`: pass
- `node --check packages/executor/dist/index.js`: pass
- `node --check packages/planner/dist/run.js`: pass

## Sandbox note

As in T017, this sandbox can emit TypeScript `dist/` files but the `tsc` process may remain open instead of returning cleanly. The committed `dist/` files were generated and then validated with Node syntax checks plus runtime tests.
