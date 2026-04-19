# ForgeRoot Thread Handoff: after T025

Date: 2026-04-18 JST
Recommended next task: **T026 approval checkpoint**

## Completed in T025

T025 added a deterministic GitHub PR adapter boundary.

Main deliverables:

- `.forge/agents/github-pr-adapter.alpha.forge`
- `packages/github-pr-adapter/src/run.ts`
- `packages/github-pr-adapter/tests/run.test.mjs`
- `packages/github-pr-adapter/README.md`
- `docs/specs/t025-validation-report.md`

Primary API:

```ts
prepareGitHubPullRequest(input)
validateGitHubPullRequestCreationRequest(request)
GITHUB_PR_ADAPTER_CONTRACT
```

Aliases:

```ts
prepareGithubPullRequest(input)
prepareGitHubPR(input)
prepareGithubPR(input)
validateGithubPullRequestCreationRequest(request)
validateGitHubPRCreationRequest(request)
validateGithubPRCreationRequest(request)
```

## Current Phase 1 chain

The first forging loop now has deterministic manifests up to GitHub PR request preparation:

1. T015 intake classifier
2. T016 Plan Spec DSL
3. T017 planner runtime
4. T018 branch/worktree manager
5. T019 executor sandbox request harness
6. T023 auditor runtime
7. T024 PR composer
8. T025 GitHub PR adapter

## T025 boundary

T025 may prepare one GitHub App PR creation request from one ready PR composition. It does not perform network transport by itself.

Preserved guards:

- GitHub App installation token only
- no PAT or user token
- no token persistence
- no merge operation
- no auto-approval
- no default-branch write
- no workflow/policy mutation
- no memory/evaluation update
- no network/federation behavior

Non-dry-run preparation is blocked unless explicit runtime and rate-limit gates authorize `open_pull_request`.

## Validation summary

- GitHub PR adapter tests: 10 pass / 0 fail
- PR composer regression tests: 8 pass / 0 fail
- Auditor regression tests: 22 pass / 0 fail
- Executor regression tests: 21 pass / 0 fail
- Planner regression tests: 23 pass / 0 fail
- Node syntax checks: pass

## Recommended T026 boundary

T026 should add an approval checkpoint in front of trusted GitHub transport.

Suggested deliverables:

- `.forge/agents/approval-checkpoint.alpha.forge`
- `packages/approval-checkpoint/src/run.ts`
- `packages/approval-checkpoint/tests/run.test.mjs`
- `docs/specs/t026-validation-report.md`

Suggested behavior:

- consume the T025 GitHub PR creation request manifest
- inspect approval class, risk, runtime mode, source issue, and requested mutation surface
- decide whether transport is allowed, held, quarantined, or invalid
- preserve human review-before-merge gates
- produce a transport authorization manifest only when the request is safe for PR creation

Out of scope for T026:

- live GitHub API transport
- merge approval
- auto-merge
- memory/evaluation updates
- workflow or policy mutation
- federation behavior
