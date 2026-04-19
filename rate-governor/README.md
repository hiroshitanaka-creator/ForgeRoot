# @forgeroot/rate-governor

Deterministic T027 rate governor queue for ForgeRoot.

This package consumes one T026 `trusted_transport_authorization` manifest and returns one of four decisions:

- `queued` / `queue` — emit one queue entry / dispatch manifest for a later trusted transport worker
- `delayed` / `delay` — preserve repo-lane, retry-after, cooldown, content-create, PR-create, or secondary point constraints
- `blocked` / `block` — stop transport because the latest runtime gate no longer allows trusted write transport
- `invalid` / `invalid` — reject malformed or unsafe transport authorization manifests

## Boundary

T027 does **not** call GitHub, create a PR, merge, approve, persist tokens, edit files, mutate workflows/policies, update memory/evaluation state, or federate.

It only creates a reviewable queue/dispatch manifest that a later trusted GitHub transport worker may consume.

## API

```ts
runRateGovernor(input)
validateTransportAuthorizationForRateGovernor(authorization)
validateRateGovernorDispatch(dispatch)
deriveRateGovernorCooldown(observation, options)
RATE_GOVERNOR_QUEUE_CONTRACT
```

Aliases are exported for ergonomic continuity:

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

## Policy encoded in T027

- One repository has at most one mutating lane.
- Write/content-creating transport is queued serially before any trusted worker may call GitHub.
- ForgeRoot's stricter content-create soft cap is 20 requests per minute.
- ForgeRoot's PR creation hard cap is 5 new PRs per hour per repository.
- Mutative REST transport reserves 5 secondary-rate-limit points in the queue manifest.
- `retry-after` and primary reset headers become cooldown manifests.
- Repeated secondary-limit failures use exponential cooldown steps of 60s, 300s, 1800s, then 7200s with human acknowledgement at the fourth step.
- Runtime `observe`, `propose`, `quarantine`, `halted`, kill switch, or closed mutating lane blocks dispatch.
