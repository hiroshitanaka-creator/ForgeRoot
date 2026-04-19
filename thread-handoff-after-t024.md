# T026 validation report — approval checkpoint

## Scope

T026 introduces the approval checkpoint boundary between the T025 GitHub PR adapter and any future trusted GitHub transport worker.

Inputs:

- one `github_pull_request_creation_request` manifest from T025
- runtime mode gate metadata
- rate-limit gate metadata
- optional human approval records

Outputs:

- one `transport_authorization` manifest when transport is allowed
- held / quarantined / invalid decisions when transport must not proceed

## Implemented files

- `.forge/agents/approval-checkpoint.alpha.forge`
- `packages/approval-checkpoint/src/run.ts`
- `packages/approval-checkpoint/src/index.ts`
- `packages/approval-checkpoint/tests/run.test.mjs`
- `packages/approval-checkpoint/README.md`
- `packages/approval-checkpoint/dist/*`

## Boundary assertions

| Assertion | Result |
|---|---|
| Consumes one T025 GitHub PR creation request manifest | pass |
| Produces at most one transport authorization manifest | pass |
| Does not call GitHub or create a PR | pass |
| Does not merge, auto-merge, approve, or self-approve | pass |
| Holds dry-run requests before live trusted transport | pass |
| Holds Class B transport without human approval | pass |
| Allows Class A low-risk transport when runtime and rate gates pass | pass |
| Allows Class B transport after non-self human approval | pass |
| Quarantines kill-switch / halted runtime state | pass |
| Quarantines Class D, critical risk, and governance mutation surfaces | pass |
| Rejects malformed request manifests and merge endpoints | pass |
| Rejects secret-like material in generated authorizations | pass |

## Test results

T026 package tests:

```text
T026 approval checkpoint: 10 pass / 0 fail
```

Regression tests run after T026:

```text
GitHub PR adapter tests: 10 pass / 0 fail
PR composer tests: 8 pass / 0 fail
Auditor tests: 22 pass / 0 fail
Executor tests: 21 pass / 0 fail
Planner tests: 23 pass / 0 fail
```

Syntax checks:

```text
packages/approval-checkpoint/dist/run.js: pass
packages/approval-checkpoint/dist/index.js: pass
packages/github-pr-adapter/dist/run.js: pass
packages/pr-composer/dist/run.js: pass
packages/auditor/dist/run.js: pass
packages/executor/dist/index.js: pass
packages/planner/dist/run.js: pass
```

## Deferred

T026 intentionally does not add:

- live GitHub API transport
- PR creation execution
- merge / auto-merge / approval execution
- memory or evaluation update
- workflow / policy mutation
- federation behavior

The next boundary should introduce the rate governor queue that receives authorization and schedules write/content-create lanes before any trusted transport worker is implemented.
