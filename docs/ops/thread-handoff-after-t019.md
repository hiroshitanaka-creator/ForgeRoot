# ForgeRoot Thread Handoff: after T019

Date: 2026-04-18 JST

Recommended next target: **T023 Auditor runtime**

## Current state

ForgeRoot has completed the deterministic intake, planning, branch/worktree preparation, and sandbox-request boundary:

- T015 issue intake classifier
- T016 Plan Spec DSL
- T017 planner runtime
- T018 branch/worktree manager
- T019 executor sandbox harness

T019 introduced `packages/executor/src/sandbox.ts` and `.forge/agents/executor.alpha.forge`. The harness is intentionally manifest-only. It prepares a bounded sandbox execution request and validates commands, environment, mutable path scope, network/token settings, and output artifact declarations. It does not execute commands, edit files, create commits, open pull requests, generate audit reports, or mutate GitHub.

## Key files from T019

- `.forge/agents/executor.alpha.forge`
- `packages/executor/src/sandbox.ts`
- `packages/executor/tests/sandbox.test.mjs`
- `packages/executor/README.md`
- `docs/specs/t019-validation-report.md`

## T019 API surface

```ts
createSandboxExecutionRequest(worktreePlan, options)
validateSandboxExecutionRequest(request)
validateSandboxObservedOutput(request, output)
EXECUTOR_SANDBOX_HARNESS_CONTRACT
```

## Invariants preserved

- Git remains the source of truth.
- PR remains the only evolution transport path.
- One accepted task becomes one Plan Spec.
- One ready Plan Spec becomes at most one branch/worktree manifest.
- One branch/worktree manifest becomes at most one sandbox execution request.
- Default branch writes remain forbidden.
- Sandbox network defaults to off.
- GitHub token mode defaults to none.
- Secret mounts are forbidden.
- Workflow, policy, and network paths remain immutable unless a separate elevated task approves them.

## Recommended T023 boundary

T023 should add an Auditor runtime that consumes the plan, branch/worktree manifest, sandbox request, and later sandbox output summaries. It should produce an independent audit result/report object for review gates without composing a PR or mutating GitHub.

Suggested out of scope for T023:

- PR composer
- GitHub mutation
- real sandbox execution
- executor patch generation
- workflow mutation
- policy mutation
- network/federation behavior
- self-evolution
