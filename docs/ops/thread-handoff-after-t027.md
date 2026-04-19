# ForgeRoot Thread Handoff: after T027

Date: 2026-04-18 JST
Recommended next task: **T028 end-to-end forged PR demo**

## Completed in T027

T027 added a deterministic rate governor queue boundary after the T026 approval checkpoint.

Main deliverables:

- `.forge/agents/rate-governor.alpha.forge`
- `packages/rate-governor/src/run.ts`
- `packages/rate-governor/tests/run.test.mjs`
- `packages/rate-governor/README.md`
- `docs/specs/t027-validation-report.md`

Primary API:

```ts
runRateGovernor(input)
validateTransportAuthorizationForRateGovernor(authorization)
validateRateGovernorDispatch(dispatch)
deriveRateGovernorCooldown(observation, options)
RATE_GOVERNOR_QUEUE_CONTRACT
```

Compatibility aliases:

```ts
governRateLimit(input)
runRateGovernorQueue(input)
enqueueTrustedTransport(input)
enqueueTransportAuthorization(input)
queuePullRequestTransport(input)
governTrustedTransport(input)
governGitHubPullRequestTransport(input)
governGithubPullRequestTransport(input)
validateRateGovernorAuthorization(authorization)
validateTrustedTransportAuthorizationForRateGovernor(authorization)
validateRateGovernorQueueEntry(dispatch)
validateRateGovernorDecision(dispatch)
validateGitHubTransportDispatch(dispatch)
validateGithubTransportDispatch(dispatch)
deriveCooldownFromRateLimitResponse(observation, options)
deriveRetryAfterCooldown(observation, options)
```

## Current Phase 1 chain

The first forging loop now has deterministic manifests up to rate-governed dispatch:

1. T015 intake classifier
2. T016 Plan Spec DSL
3. T017 planner runtime
4. T018 branch/worktree manager
5. T019 executor sandbox request harness
6. T023 auditor runtime
7. T024 PR composer
8. T025 GitHub PR adapter
9. T026 approval checkpoint
10. T027 rate governor queue

## T027 boundary

T027 may queue, delay, block, or invalidate trusted transport dispatch. It does not perform live GitHub transport.

Preserved guards:

- GitHub App installation token metadata only
- no live GitHub API call
- no PR creation inside the rate governor
- no merge / auto-merge / auto-approval
- no default-branch write
- no token material or token persistence
- one repository mutating lane
- content-create budget preservation
- PR-create budget preservation
- retry-after / cooldown preservation
- no memory/evaluation update
- no network/federation behavior

## Validation summary

- Rate governor tests: 10 pass / 0 fail
- Approval checkpoint regression tests: 10 pass / 0 fail
- GitHub PR adapter regression tests: 10 pass / 0 fail
- PR composer regression tests: 8 pass / 0 fail
- Auditor regression tests: 22 pass / 0 fail
- Executor regression tests: 21 pass / 0 fail
- Planner regression tests: 23 pass / 0 fail
- Node syntax checks: pass

## Recommended T028 boundary

T028 should wire the deterministic Phase 1 chain into an end-to-end forged PR demo.

Suggested deliverables:

- `docs/ops/t028-e2e-forged-pr-demo.md`
- `packages/forge-demo/src/run.ts` or an existing package-level demo harness if the repo map chooses one
- `packages/forge-demo/tests/run.test.mjs` if a package is added
- `docs/specs/t028-validation-report.md`

Suggested behavior:

- take one forge:auto issue-like input
- produce the full manifest chain from intake through rate-governed dispatch
- verify one task → one plan → one worktree manifest → one sandbox request → one audit → one PR composition → one GitHub request → one approval authorization → one rate-governed dispatch
- keep live GitHub transport out of scope unless a separate trusted transport worker is explicitly introduced

Out of scope for T028:

- live GitHub API transport
- real PR creation execution
- merge / approval execution
- memory/evaluation updates
- workflow or policy mutation
- federation behavior
