# Network Boundary Policy (T067)

T067 defines a deterministic, manifest-only sandbox boundary for peer actions.
It does not perform network transport, create pull requests, mutate policy,
adopt imported lineage, discover peers, or enable open federation.

## API

- `enforceNetworkBoundary(input)`
- `validateNetworkBoundary(result)`
- Stable aliases:
  - `runT067NetworkSandboxPolicy(input)`
  - `validateT067NetworkSandboxPolicy(result)`

The implementation lives in `packages/network/src/boundary.ts` and is exported
from `packages/network/src/index.ts`.

## Policy

The policy file is `.forge/policies/network-boundary.forge`.

It enforces:

- treaty-gated peer actions
- known active peer requirement
- lineage imports as candidate evidence only
- open federation forbidden by default
- manifest-only side-effect boundaries

The high-risk policy and federation boundary change was explicitly approved for
T067 before implementation.

## Inputs

The evaluator consumes:

- runtime gate: mode, allowed state, kill switch, open federation request flag
- peer snapshot: peer id, repository, status, registry-known flag
- treaty scope: treaty id, source peer, target peer, status, allowed actions,
  optional expiry
- peer action request: action, source peer, target peer, optional lineage,
  proposal, evidence digest, adoption request flag, transport request flag
- reputation summary: score and recommended action

The result stores normalized inputs so validation can recompute the decision.

## Decisions

The boundary can produce:

- `allowed` / `boundary_allowed`
- `rejected` / `boundary_rejected`
- `quarantined` / `boundary_quarantined`
- `invalid` / `invalid_network_boundary_input`

Allowed decisions require all of the following:

- runtime mode is `federate`
- runtime is allowed and kill switch is not engaged
- peer is known and active
- treaty is active and unexpired
- treaty source and target match the request
- requested action is in the treaty allowlist
- reputation does not request quarantine or revocation review
- reputation score is at least 30
- no network transport is requested
- no imported lineage adoption is requested
- open federation is not requested

## Rejection

Known peers are rejected when the request violates a treaty or runtime rule,
including:

- requested action outside the treaty allowlist
- inactive or expired treaty
- source, target, or peer mismatch
- non-federate runtime mode
- runtime kill switch
- network transport request
- imported lineage adoption request

## Quarantine

Inputs are quarantined when they indicate:

- unknown peer
- quarantined peer
- reputation quarantine
- reputation revocation review
- reputation score below the minimum threshold
- open federation request

Quarantine takes precedence over rejection so unknown or open-federation input
does not become a merely rejected known-peer action.

## Validation

`validateNetworkBoundary` rejects:

- unknown enum values
- invalid timestamps
- secret-shaped strings
- missing resolved nullable request fields
- nested unknown keys
- unsorted or duplicate action arrays
- digest or deterministic id drift
- mutated guard or dry-run side-effect flags
- open federation default changes
- automatic lineage adoption changes

The validator recomputes status, decision, reasons, allowed actions, denied
actions, and boundary summary from the stored inputs.

## Boundaries

Every result carries guards and dry-run fields proving:

- no network transport
- no file write
- no GitHub API call
- no git push
- no policy weakening
- no lineage adoption
- no open federation enablement

## Out Of Scope

- live network transport
- open federation
- external crawler
- automatic treaty changes
- GitHub PR creation
- runtime policy weakening
