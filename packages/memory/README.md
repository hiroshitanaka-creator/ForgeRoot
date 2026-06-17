# @forgeroot/memory

ForgeRoot Phase 2 memory foundation: deterministic working memory update and episode digest manifests.

## Tasks

| Task | Description |
|---|---|
| T029 | Memory partition contract (four-layer model, policy, docs) |
| T030 | Deterministic working memory update manifest |
| T031 | Deterministic episode digest manifest |

## Scope

This package provides manifest writers and validators for the memory foundation layer.
It does **not** implement:

- MemoryKeeper agent runtime
- Semantic retrieval or vector indexing
- Archive packer
- Eval scoring
- Self-evolution or federation
- Live GitHub API transport

## APIs

```typescript
import {
  createWorkingMemoryUpdate,
  validateWorkingMemoryUpdate,
  createEpisodeDigest,
  validateEpisodeDigest,
} from "@forgeroot/memory";
```

### `createWorkingMemoryUpdate(input, options?)`

Produces a deterministic `WorkingMemoryUpdate` manifest from validated source refs and facts.

Constraints enforced:
- `source.task_id` must start with `T`
- `source.artifact_sha256` must match `sha256:<64 hex>`
- `facts` must be non-empty and within `max_items`
- Facts are deduped by normalized id and sorted by id
- Tags within each fact are sorted and deduplicated
- No secret-like key names (TOKEN, SECRET, PASSWORD, PRIVATE_KEY, CREDENTIAL)
- `approval.direct_write_allowed` is always `false`
- `guards.no_direct_forge_write` is always `true`

### `validateWorkingMemoryUpdate(value)`

Validates an existing `WorkingMemoryUpdate` manifest against the full schema contract.

### `createEpisodeDigest(input, options?)`

Produces a deterministic `EpisodeDigest` manifest for any episode outcome type:
`accepted | rejected | blocked | quarantined | failed | reverted | unknown`

Constraints enforced:
- Summary max 1200 chars; title max 160 chars
- `source.task_id` required, starts with `T`
- `source.artifact_sha256` required
- `episode.type === "unknown"` requires `reliability === "unknown"`
- Related IDs and PR numbers are sorted and deduplicated
- No secret-like keys or values
- `retention.preserve_rejected` and `preserve_blocked` are always `true`

### `validateEpisodeDigest(value)`

Validates an existing `EpisodeDigest` manifest against the full schema contract.

## Build & Test

```bash
npm install
npm run build
npm test
# or directly:
node --test --test-force-exit tests/*.test.mjs
```

## Invariants

- This package never writes to `.forge` directly.
- This package never calls GitHub APIs.
- This package never computes eval scores.
- Curated memory updates must move through a pull request.
- Runtime DB and vector index are derived state, not source of truth.
