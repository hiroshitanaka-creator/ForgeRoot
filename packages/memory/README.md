# @forgeroot/memory

ForgeRoot Phase 2 memory foundation: deterministic working memory update, episode digest, archive pack, and retrieval adapter manifests.

## Tasks

| Task | Description |
|---|---|
| T029 | Memory partition contract (four-layer model, policy, docs) |
| T030 | Deterministic working memory update manifest |
| T031 | Deterministic episode digest manifest |
| T032 | Deterministic memory archive pack manifest |
| T033 | Deterministic memory retrieval adapter |

## Scope

This package provides manifest writers and validators for the memory foundation layer.
It does **not** implement:

- MemoryKeeper agent runtime
- Vector indexing or embedding providers
- Runtime database
- Eval scoring
- Self-evolution or federation
- Live GitHub API transport
- Archive compaction scheduler

## APIs

```typescript
import {
  createWorkingMemoryUpdate,
  validateWorkingMemoryUpdate,
  createEpisodeDigest,
  validateEpisodeDigest,
  createMemoryArchivePack,
  validateMemoryArchivePack,
  verifyMemoryArchivePack,
  createMemoryRetrievalRequest,
  retrieveMemoryContext,
  validateMemoryRetrievalResult,
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

### `createMemoryArchivePack(input, options?)`

Produces a deterministic `MemoryArchivePack` manifest over a set of memory records.

Constraints enforced:
- `source.task_id` must start with `T`
- `source.source_artifacts` must be non-empty array of `sha256:<64 hex>` values
- `records` must be non-empty; deduped by `record_id` (first-occurrence)
- Records sorted by `record_id` lexicographically
- `raw_jsonl_sha256` computed via SHA256 of canonical JSONL (keys sorted, one record per line)
- Same records in any input order always produce the same hash
- Pack kind auto-inferred: `"episode_digest"`, `"working_memory"`, or `"mixed"`
- `compression_performed: false`, `compressed_sha256: null` (boundary only)
- No secret or destructive keys permitted

### `validateMemoryArchivePack(value)`

Validates an existing pack manifest. `no_*` guard key names are excluded from
the destructive key scan.

### `verifyMemoryArchivePack(pack, records)`

Re-derives the JSONL hash from supplied records and compares to the stored
manifest hash. Detects tampered or missing records.

### `createMemoryRetrievalRequest(input, options?)`

Creates a validated retrieval request. `token_budget` defaults to 4096, capped at 32768.

### `retrieveMemoryContext(input, options?)`

Scores and selects candidate items by `relevance + lexicalScore`. Admits items
greedily within `token_budget`. All three derived indexes are always `false`.

### `validateMemoryRetrievalResult(value)`

Validates an existing retrieval result manifest.

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
