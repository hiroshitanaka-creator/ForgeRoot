# Federation Observability (T068)

T068 defines a deterministic report artifact for federation observability. It
shows peer status, treaty status, lineage import/export activity, reputation
signals, and T067 boundary decisions without becoming source-of-truth state.

## API

- `renderFederationReport(input)`
- `validateFederationReport(result)`
- Stable aliases:
  - `runT068FederationObservability(input)`
  - `validateT068FederationObservability(result)`

The implementation lives in `packages/reporting/src/federation-report.ts` and
is exported from `packages/reporting/src/index.ts`.

## Inputs

The report consumes:

- source refs for peer registry, treaties, lineage, reputation, and boundary
  policy evidence
- peer summaries with status, treaty summary, reputation score/action, and last
  interaction time
- lineage exchange summaries for import/export direction, pack id, status,
  boundary decision, and adoption flag
- T067 boundary decisions for peer action requests

## Outputs

`renderFederationReport` emits one manifest containing:

- normalized inputs
- summary counters
- per-peer report rows
- JSON report object
- Markdown report string
- guard and dry-run fields
- deterministic digest and id

## Visibility

The report must include revoked and quarantined peers. It must not hide risky
peers merely because they are not currently eligible for network actions.

Risk flags include:

- `peer_quarantined`
- `peer_revoked`
- `treaty_not_active`
- `reputation_quarantine`
- `reputation_revocation_review`
- `boundary_quarantined`
- `boundary_rejected`

## Source-Of-Truth Boundary

The report is a derived artifact:

- `source_of_truth` is false
- `treaty_replacement` is false
- `authoritative_peer_state` is false
- `authoritative_reputation` is false

The validator rejects mutations that turn the report into authoritative treaty,
peer, or reputation state.

## Validation

`validateFederationReport` recomputes and compares:

- summary counters
- per-peer report rows
- JSON report
- Markdown report
- deterministic digest and id

It also rejects:

- unknown enum values
- invalid timestamps
- secret-shaped strings
- missing or unknown peer references
- unknown boundary references
- lineage adoption authority
- unsorted resolved report inputs
- nested unknown keys
- source-of-truth boundary weakening
- side-effect flag mutation

## Out Of Scope

- browser extension UI
- live dashboard hosting
- network transport
- automatic treaty changes
- authoritative reputation writes
