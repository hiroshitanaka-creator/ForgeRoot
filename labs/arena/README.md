# Arena Lab

T065 reserves this lab namespace for conflict arbitration arena examples.

The production surface is the manifest-only API in
`packages/eval/src/arena.ts`:

- `compareArenaCandidates(input)`
- `validateArenaComparison(result)`
- `runT065ConflictArena(input)`
- `validateT065ConflictArena(result)`

## Boundary

The arena compares supplied candidate manifests and emits a deterministic
decision manifest. It does not:

- merge changes
- negotiate with peers
- execute live benchmarks
- run a global consensus protocol
- call GitHub APIs
- write files or mutate policies

Reputation is accepted only as a bounded auxiliary signal. The arena weights it
at 10 percent and stores `reputation_is_sole_basis: false` in the score policy,
summary, and authority boundary.

## Input Shape

Each arena input supplies:

- `arena_id`
- `conflict`: `conflict_id`, `reason`, `summary`
- `eval_binding`: shadow-run, eval suite, and lineage-threshold references
- `candidates`: at least two candidate registrations

Candidates carry local eval score, lineage score, peer reputation score, risk,
policy compliance, source kind, proposal ref, and evidence digest.

## Expected Outcomes

The result can be:

- `arena_ready` with one `winner` and one or more `loser` candidates
- `arena_inconclusive` when the top score margin is below threshold
- `blocked` when side-effect boundaries are requested or fewer than two
  eligible candidates remain
- `invalid` for malformed input

Local policy breach candidates are rejected even when their numeric scores are
high.
