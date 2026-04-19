# @forgeroot/approval-checkpoint

Deterministic T026 approval checkpoint for ForgeRoot.

This package consumes one T025 `github_pull_request_creation_request` manifest and returns one of four decisions:

- `authorized` / `authorize` — emit one trusted transport authorization manifest
- `held` / `hold` — wait for human approval, runtime gate, rate gate, source traceability, or non-dry-run state
- `quarantined` / `quarantine` — stop transport for halted/quarantine runtime, kill switch, Class D, critical risk, or governance mutation surface
- `invalid` / `invalid` — reject malformed or unsafe manifests

## Boundary

T026 does **not** call GitHub, create a PR, merge, approve, persist tokens, edit files, mutate workflows/policies, update memory/evaluation state, or federate.

It only creates a reviewable manifest that a later trusted transport/rate-governed worker may consume.

## API

```ts
runApprovalCheckpoint(input)
validateGitHubPullRequestCreationRequestForApproval(request)
validateTransportAuthorization(authorization)
APPROVAL_CHECKPOINT_CONTRACT
```

Aliases are exported for ergonomic continuity:

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
```

## Approval policy encoded in T026

- Class A + low risk may be authorized by runtime and rate gates alone.
- Class B / medium or higher requires a human approval record.
- Class C requires two approvals including a code owner.
- Class D remains manual and is quarantined by this checkpoint.
- Critical risk is quarantined.
- Runtime `halted` / `quarantine` or an engaged kill switch quarantines transport.
- Dry-run requests are held before trusted transport.
