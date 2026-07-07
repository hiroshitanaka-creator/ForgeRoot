# Peer Reputation Scoring (T063)

T063 adds deterministic, manifest-only peer reputation scoring. The score is an
advisory input for human and policy review. It is never the source of truth for
adoption, merge, federation access, or policy mutation.

## API

- `evaluatePeerReputation(input)`
- `validatePeerReputation(result)`
- Stable aliases:
  - `runT063PeerReputationScoring(input)`
  - `validateT063PeerReputationScoring(result)`

The implementation lives in `packages/eval/src/peer-reputation.ts` and is
exported from `packages/eval/src/index.ts`.

## Inputs

The scorer consumes:

- peer reference: `peer_id`, `repository_full_name`, `status`
- treaty reference: `treaty_id`, `status`, `source_peer_id`,
  `target_peer_id`, optional `expires_at`
- proposal outcomes: `accepted`, `rejected`, `blocked`, or `invalid`
- policy compliance state per outcome
- optional policy events with severity and advisory action
- optional scoring weights

Inputs are normalized into sorted `scoring_inputs`. The result stores resolved
weights so validation can fully rebuild the score later.

## Scoring

The baseline score is `50`. Deltas are applied deterministically:

| Signal | Default delta |
|---|---:|
| accepted outcome | 8 |
| rejected outcome | -10 |
| blocked outcome | -6 |
| invalid outcome | -12 |
| low policy breach | -4 |
| medium policy breach | -10 |
| high policy breach | -22 |
| critical policy breach | -35 |
| low policy event | -4 |
| medium policy event | -10 |
| high policy event | -25 |
| critical policy event | -40 |

The final score is clamped to `0..100`.

## Actions

The result includes a recommended advisory action:

- `observe`
- `downrank`
- `quarantine`
- `revocation_review`

Repeated rejected proposals set `repeated_rejections`. High or critical policy
breaches can trigger quarantine. Critical policy events or scores below the
revocation threshold trigger `revocation_review`.

## Boundaries

Every result carries explicit authority boundaries:

- `source_of_truth_for_adoption: false`
- `automatic_adoption_allowed: false`
- `advisory_only: true`
- `adoption_decision_required: human_review_and_policy_gate`

Dry-run fields prove that no adoption, public ranking, network transport, file
write, GitHub API call, or policy mutation occurred.

## Validation

`validatePeerReputation` rebuilds and compares derived fields:

- score summary
- score deltas and final value
- recommended action
- payload digest
- deterministic reputation id

It also rejects unknown enum values, missing resolved weights, unsorted result
arrays, nested unknown keys, expired ready treaties, secret-shaped strings, and
side-effect flags.

## Out Of Scope

- global reputation network
- public ranking
- automatic adoption
- network transport
- live GitHub mutation
- policy mutation
