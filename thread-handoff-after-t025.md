# T027 validation report — rate governor queue

## Scope

T027 introduces the rate governor queue boundary between the T026 approval checkpoint and any future trusted GitHub transport worker.

Inputs:

- one `trusted_transport_authorization` manifest from T026
- current runtime gate metadata
- current repository mutating lane state
- content-create / PR-create / secondary-rate-limit queue state
- optional GitHub rate-limit observations such as `retry-after` and `x-ratelimit-reset`

Outputs:

- one `rate_governor_dispatch_decision` manifest when transport can be queued, delayed, or blocked
- invalid decision when the authorization is malformed or unsafe

## Implemented files

- `.forge/agents/rate-governor.alpha.forge`
- `packages/rate-governor/src/run.ts`
- `packages/rate-governor/src/index.ts`
- `packages/rate-governor/tests/run.test.mjs`
- `packages/rate-governor/README.md`
- `packages/rate-governor/dist/*`

## Boundary assertions

| Assertion | Result |
|---|---|
| Consumes one T026 trusted transport authorization manifest | pass |
| Produces at most one rate governor dispatch decision | pass |
| Does not call GitHub or create a PR | pass |
| Does not merge, auto-merge, approve, or persist tokens | pass |
| Enforces one repository mutating lane | pass |
| Enforces ForgeRoot content-create soft cap of 20/minute | pass |
| Enforces ForgeRoot PR-create hard cap of 5/hour/repo | pass |
| Preserves write spacing of 1200ms plus deterministic jitter up to 800ms | pass |
| Preserves retry-after and cooldown observations as delayed dispatch decisions | pass |
| Blocks when latest runtime gate no longer permits trusted write transport | pass |
| Rejects malformed authorization manifests and non-GitHub-App token source metadata | pass |
| Rejects secret-like material in dispatch manifests | pass |

## Test results

T027 package tests:

```text
Rate governor tests: 10 pass / 0 fail
```

Regression tests run after T027:

```text
Approval checkpoint tests: 10 pass / 0 fail
GitHub PR adapter tests: 10 pass / 0 fail
PR composer tests: 8 pass / 0 fail
Auditor tests: 22 pass / 0 fail
Executor tests: 21 pass / 0 fail
Planner tests: 23 pass / 0 fail
```

Syntax checks:

```text
packages/rate-governor/dist/run.js: pass
packages/rate-governor/dist/index.js: pass
packages/approval-checkpoint/dist/run.js: pass
packages/github-pr-adapter/dist/run.js: pass
packages/pr-composer/dist/run.js: pass
packages/auditor/dist/run.js: pass
packages/executor/dist/index.js: pass
packages/planner/dist/run.js: pass
```

## GitHub API guidance encoded

T027 follows ForgeRoot's own stricter limits and preserves GitHub's documented rate-limit behavior:

- serial queueing before mutative requests
- at least 1 second spacing for heavy mutative traffic, implemented as ForgeRoot's 1200ms + jitter rule
- retry-after preservation
- primary reset preservation
- secondary-limit exponential cooldown

## Deferred

T027 intentionally does not add:

- live GitHub API transport
- PR creation execution
- merge / auto-merge / approval execution
- memory or evaluation update
- workflow / policy mutation
- federation behavior

The next boundary should introduce T028 end-to-end forged PR demo wiring over the existing deterministic manifest chain.
