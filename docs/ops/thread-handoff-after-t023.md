# ForgeRoot Thread Handoff: after T023

Date: 2026-04-18 JST

Recommended next target: **T024 PR composer**

## Current state

ForgeRoot has completed the deterministic intake, planning, branch/worktree preparation, sandbox-request boundary, and independent audit boundary for the first Phase 1 forging loop:

- T015 issue intake classifier
- T016 Plan Spec DSL
- T017 planner runtime
- T018 branch/worktree manager
- T019 executor sandbox harness
- T023 auditor runtime

T023 introduced `.forge/agents/auditor.alpha.forge` and `packages/auditor/src/run.ts`. The auditor consumes one Plan Spec, one branch/worktree manifest, one sandbox request, and observed sandbox evidence. It produces a bounded audit result with a PR-composition gate decision.

The auditor is intentionally evidence-only. It validates chain consistency, declared artifacts, observed command IDs, environment safety, mutable/immutable path scope, and machine-checkable acceptance criteria. It does not execute commands, edit files, create branches, create commits, compose pull requests, mutate GitHub, approve merges, update memory, or perform federation behavior.

## Key files from T023

- `.forge/agents/auditor.alpha.forge`
- `packages/auditor/src/run.ts`
- `packages/auditor/src/index.ts`
- `packages/auditor/tests/audit.test.mjs`
- `packages/auditor/tests/run.test.mjs`
- `packages/auditor/README.md`
- `docs/specs/t023-validation-report.md`

## T023 API surface

```ts
runAuditor(input)
validatePlanSpecForAudit(plan)
validateBranchWorktreePlanForAudit(worktreePlan)
validateSandboxExecutionRequestForAudit(request)
validateAuditResult(report)
validateAuditReport(report)
AUDITOR_RUNTIME_CONTRACT
```

## Audit result contract

Runtime statuses:

- `passed` — evidence and acceptance criteria pass; a later PR composer may proceed.
- `failed` — evidence exists but violates scope, artifact, command, environment, or acceptance checks.
- `blocked` — sandbox observed output is missing, so audit cannot pass.
- `invalid` — supplied plan/worktree/sandbox chain is malformed or inconsistent.

Gate decisions:

- `allow_pr_composition`
- `request_changes`
- `block_pr_composition`
- `invalid`

## Invariants preserved

- Git remains the source of truth.
- PR remains the only evolution transport path.
- One accepted task becomes one Plan Spec.
- One ready Plan Spec becomes at most one branch/worktree manifest.
- One branch/worktree manifest becomes at most one sandbox execution request.
- One sandbox request and observed output become at most one audit result.
- Default branch writes remain forbidden.
- Sandbox network defaults to off.
- GitHub token mode defaults to none.
- Secret mounts are forbidden.
- Auditor does not execute commands or trust executor self-attestation as final truth.
- Workflow, policy, and network paths remain immutable unless a separate elevated task approves them.

## Recommended T024 boundary

T024 should add a PR composer that consumes a passed T023 audit result and prepares a reviewable pull-request payload/body/check metadata. It should not silently merge, bypass review, mutate policy, edit workflow files, or loosen approval gates.

Suggested shape:

- consume Plan Spec, branch/worktree manifest, sandbox request, sandbox observed output, and AuditResultReport
- require `audit.status === "passed"` and `audit.decision === "allow_pr_composition"`
- produce a deterministic PR draft/composition object with title, body, labels, reviewers/check summary, risk summary, acceptance criteria, and provenance
- preserve one-task-one-PR and no-default-branch-write invariants
- keep actual GitHub mutation isolated behind a later adapter or explicit boundary if T024 is scoped as composer-only

Suggested out of scope for T024:

- merge operation
- auto-approval
- workflow mutation
- policy mutation
- memory/evaluation updates
- network/federation behavior
- self-evolution
