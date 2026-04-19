# ForgeRoot Thread Handoff: after T026

Date: 2026-04-18 JST
Recommended next task: **T027 rate governor queue**

## Completed in T026

T026 added a deterministic approval checkpoint boundary after the T025 GitHub PR adapter.

Main deliverables:

- `.forge/agents/approval-checkpoint.alpha.forge`
- `packages/approval-checkpoint/src/run.ts`
- `packages/approval-checkpoint/tests/run.test.mjs`
- `packages/approval-checkpoint/README.md`
- `docs/specs/t026-validation-report.md`

Primary API:

```ts
runApprovalCheckpoint(input)
validateTransportAuthorization(authorization)
validateGitHubPullRequestCreationRequestForApproval(request)
APPROVAL_CHECKPOINT_CONTRACT
```

Compatibility aliases:

```ts
evaluateApprovalCheckpoint(input)
checkApprovalCheckpoint(input)
authorizeGitHubPullRequestTransport(input)
authorizeGithubPullRequestTransport(input)
authorizePullRequestTransport(input)
checkpointApproval(input)
checkpointPullRequestTransport(input)
validateApprovalCheckpointAuthorization(authorization)
validateTrustedTransportAuthorization(authorization)
validatePullRequestTransportAuthorization(authorization)
validatePRTransportAuthorization(authorization)
validateGitHubPRCreationRequestForApproval(request)
```

## Current Phase 1 chain

The first forging loop now has deterministic manifests up to approval-gated transport authorization:

1. T015 intake classifier
2. T016 Plan Spec DSL
3. T017 planner runtime
4. T018 branch/worktree manager
5. T019 executor sandbox request harness
6. T023 auditor runtime
7. T024 PR composer
8. T025 GitHub PR adapter
9. T026 approval checkpoint

## T026 boundary

T026 may authorize, hold, quarantine, or invalidate the T025 request manifest. It does not perform live GitHub transport.

Preserved guards:

- GitHub App installation token only
- no live GitHub API call
- no PR creation inside the checkpoint
- no merge / auto-merge / auto-approval
- no default-branch write
- no workflow / policy / permission mutation
- no memory/evaluation update
- no network/federation behavior
- no ForgeRoot runtime self-approval

## Validation summary

- Approval checkpoint tests: 10 pass / 0 fail
- GitHub PR adapter regression tests: 10 pass / 0 fail
- PR composer regression tests: 8 pass / 0 fail
- Auditor regression tests: 22 pass / 0 fail
- Executor regression tests: 21 pass / 0 fail
- Planner regression tests: 23 pass / 0 fail
- Node syntax checks: pass

## Recommended T027 boundary

T027 should add a rate governor queue in front of any trusted GitHub write transport.

Suggested deliverables:

- `.forge/agents/rate-governor.alpha.forge`
- `packages/rate-governor/src/run.ts`
- `packages/rate-governor/tests/run.test.mjs`
- `docs/specs/t027-validation-report.md`

Suggested behavior:

- consume T026 transport authorization manifests
- enforce one repo mutating lane
- enforce content-creating request budgets
- preserve retry-after / cooldown behavior
- emit queued / delayed / blocked / invalid dispatch decisions
- avoid live GitHub transport

Out of scope for T027:

- live GitHub API transport
- PR creation execution
- merge / approval execution
- memory/evaluation updates
- workflow or policy mutation
- federation behavior
