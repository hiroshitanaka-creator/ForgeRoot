# T053 transport readiness ledger

T053 defines a deterministic, dry-run-only readiness replay ledger for T052
mutation PR transport request manifests.

## API

Package: `@forgeroot/mutate`

Exports:

- `runTransportReadinessLedger`
- `createTransportReadinessLedger`
- `replayMutationPrTransportReadiness`
- `runT053TransportReadinessLedger`
- `validateTransportReadinessLedgerResult`
- `validateTransportReadinessLedger`
- `validateT053TransportReadinessLedger`
- `TRANSPORT_READINESS_LEDGER_CONTRACT`

## Input

`runTransportReadinessLedger(input)` accepts:

- `request`: a T052 `MutationPrTransportResult`
- `checks`: optional manual or external readiness checks
- `required_check_ids`: optional check IDs that must pass
- `now`: optional RFC3339 UTC timestamp

Manual check IDs must use lowercase kebab-case. Check status is `pass`, `fail`,
or `pending`. Evidence digests are optional input, but ledger output always
contains an evidence digest for every check.

## Output

The result has one of three statuses:

- `ready`: T052 read-back validation passed and every required check passed.
- `blocked`: the T052 manifest is valid, but a required check failed, is
  pending, or is missing.
- `invalid`: input, manual checks, or the T052 manifest is malformed or unsafe.

Built-in checks cover:

- T052 ready status
- dry-run-only runtime gate
- Class C human review gate
- PR creation endpoint safety
- token request and persistence suppression
- git push, branch creation, merge, and default branch write suppression
- approval record write, mutation execution, and GitHub API suppression

## Safety boundaries

T053 is a ledger-only replay surface. It does not:

- request or persist tokens
- call GitHub APIs
- create branches
- push git refs
- write files
- write approval records
- execute mutations
- merge pull requests

Any future live transport stage must use a separate phase gate and explicit
human approval.
