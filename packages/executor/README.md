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

## T019 executor sandbox harness

T019 adds a deterministic sandbox request boundary around the T018 manifest.

Main exports:

- `createSandboxExecutionRequest(worktreePlan, options)`
- `validateSandboxExecutionRequest(request)`
- `validateSandboxObservedOutput(request, output)`
- `SandboxExecutionRequest` and related schema types
- `EXECUTOR_SANDBOX_HARNESS_CONTRACT`

The harness prepares and validates a sandbox execution request only. It does not execute commands, edit files, create commits, open pull requests, generate audit reports, or mutate GitHub.

The request enforces:

- one T018 worktree manifest becomes at most one sandbox execution request
- network defaults to `off`
- GitHub token mode defaults to `none`
- secret mounts are forbidden
- command binaries must be allowlisted and shell/git/network mutation binaries are rejected
- command-declared writable paths must stay inside mutable scope and outside immutable scope
- artifact output is declared ahead of time and stored outside the repo worktree
- observed sandbox output can be checked against declared commands, changed paths, and artifacts

## Local development

```bash
cd packages/executor
timeout 20 tsc -p tsconfig.json
node --test --test-force-exit tests/*.test.mjs
```
