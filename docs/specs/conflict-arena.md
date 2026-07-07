# Conflict Arbitration Arena (T065)

T065 defines a deterministic arena manifest for comparing conflicting
proposals from peers, species, or local candidates.

The arena is advisory and manifest-only. It can classify conflicts, register
candidates, bind supplied local evaluation references, and produce a
winner/loser/inconclusive decision. It cannot merge, negotiate with peers,
execute live benchmarks, or claim global consensus.

## API

- `compareArenaCandidates(input)`
- `validateArenaComparison(result)`
- Stable aliases:
  - `runT065ConflictArena(input)`
  - `validateT065ConflictArena(result)`

The implementation lives in `packages/eval/src/arena.ts` and is exported from
`packages/eval/src/index.ts`.

## Inputs

An arena input includes:

- `arena_id`
- `conflict`
  - `conflict_id`
  - `reason`: `policy_conflict`, `lineage_conflict`, `behavior_conflict`, or
    `scope_conflict`
  - `summary`
- `eval_binding`
  - `shadow_run_ref`
  - `eval_suite_ref`
  - `lineage_threshold_ref`
  - optional side-effect request flags, which block the arena when true
- optional `thresholds`
- `candidates`, with at least two entries

Candidate registrations include source kind, source ref, proposal ref, policy
compliance, local policy breach state, local eval score, lineage score,
reputation score, risk, and evidence digest.

## Scoring

The score policy is fixed:

| Signal | Weight |
|---|---:|
| Local eval score | 60% |
| Lineage score | 30% |
| Reputation score | 10% |

Risk penalties are:

| Risk | Penalty |
|---|---:|
| low | 0 |
| medium | 5 |
| high | 12 |
| critical | 25 |

The arena records `reputation_is_sole_basis: false` in the score policy,
summary, and authority boundary. Validation rejects manifests that try to make
reputation the sole basis.

## Decisions

The result status can be:

- `arena_ready`: at least two eligible candidates remain and the top score
  margin meets `min_winner_margin`.
- `arena_inconclusive`: at least two eligible candidates remain but the top
  margin is too small.
- `blocked`: requested side effects are out of scope or fewer than two eligible
  candidates remain.
- `invalid`: input is malformed or contains unsafe material.

Candidate decisions can be:

- `winner`
- `loser`
- `rejected`
- `inconclusive`

Policy-breach candidates are rejected. Local candidates with
`local_policy_breach: true` are rejected even when their numeric scores are
high.

## Validation

`validateArenaComparison` checks:

- top-level schema, status, decision, and timestamp
- conflict reason allowlist
- eval binding refs
- resolved thresholds
- fixed score policy and reputation boundary
- sorted candidate inputs and candidate results
- authority and dry-run side-effect guards
- deterministic recomputation of candidate results, summary, terminal status,
  reasons, digest, and result id
- secret-shaped material

The validator is intentionally read-back oriented: a ready, blocked, or
inconclusive manifest must be reproducible from its stored normalized inputs.

## Out Of Scope

- automatic merge
- peer negotiation
- live benchmark execution
- global consensus protocol
- network transport
- GitHub mutation
- file writes
- policy mutation
