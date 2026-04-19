# ForgeRoot Thread Handoff: after T024

Date: 2026-04-18 JST

Recommended next target: **T025 GitHub PR adapter**

## Current state

ForgeRoot has now completed the deterministic intake, planning, branch/worktree preparation, sandbox-request boundary, independent audit boundary, and PR-composition boundary for the first Phase 1 forging loop:

- T015 issue intake classifier
- T016 Plan Spec DSL
- T017 planner runtime
- T018 branch/worktree manager
- T019 executor sandbox harness
- T023 auditor runtime
- T024 PR composer

T024 introduced `.forge/agents/pr-composer.alpha.forge` and `packages/pr-composer/src/run.ts`. The composer consumes a passed T023 audit chain and emits a deterministic `PullRequestComposition` manifest with title, body, labels, reviewers, check summary, risk/approval summary, artifact summary, and provenance.

The composer is intentionally mutation-free. It does not call GitHub, create a pull request, approve, merge, edit files, create commits, update memory/evaluation state, or perform federation behavior.

## Key files from T024

- `.forge/agents/pr-composer.alpha.forge`
- `packages/pr-composer/src/run.ts`
- `packages/pr-composer/src/index.ts`
- `packages/pr-composer/tests/run.test.mjs`
- `packages/pr-composer/README.md`
- `docs/specs/t024-validation-report.md`

## T024 API surface

```ts
composePullRequest(input)
composePr(input)
composePR(input)
validatePullRequestComposition(composition)
validatePrComposition(composition)
validatePRComposition(composition)
PR_COMPOSER_CONTRACT
```

## Composition result contract

Runtime statuses:

- `ready` — a later GitHub adapter may consume the manifest.
- `blocked` — the audit result did not pass or did not allow PR composition.
- `invalid` — supplied chain data is malformed or inconsistent.

Generated manifest fields include:

- `pull_request.title`
- `pull_request.body`
- `pull_request.head`
- `pull_request.base`
- `pull_request.labels`
- `review.approval_class`
- `review.risk`
- `review.check_summary`
- `scope`
- `artifacts`
- `provenance`
- `guards`

## Invariants preserved

- Git remains the source of truth.
- PR remains the only evolution transport path.
- One accepted task becomes one Plan Spec.
- One ready Plan Spec becomes at most one branch/worktree manifest.
- One branch/worktree manifest becomes at most one sandbox execution request.
- One sandbox request and observed output become at most one audit result.
- One passed audit result becomes at most one PR composition manifest.
- Default branch writes remain forbidden.
- Composer output is not an opened pull request.
- GitHub mutation remains isolated behind a later adapter.
- Merge and approval remain human/ruleset governed.
- Workflow, policy, network, memory, and self-evolution behavior remain out of scope.

## Recommended T025 boundary

T025 should add a GitHub PR adapter that consumes a validated `PullRequestComposition` manifest and prepares the narrow GitHub App mutation request needed to open a pull request. Keep the adapter separated from merge/approval behavior.

Suggested shape:

- consume one validated PR composition manifest
- validate repository/head/base/title/body/labels/reviewers before mutation
- preserve no-default-branch-write and one-task-one-PR
- create no merge, approval, memory, evaluation, workflow, policy, or federation side effects
- expose a dry-run mode and a mutation request shape before live GitHub calls
- keep rate-limit and runtime-mode checks as explicit prerequisites if live adapter behavior is introduced

Suggested out of scope for T025:

- merge operation
- auto-approval
- approval checkpoint mutation
- memory/evaluation updates
- workflow or policy mutation
- network/federation behavior
- self-evolution
