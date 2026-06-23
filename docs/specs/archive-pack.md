# T032 — Deterministic Memory Archive Pack

## Purpose

`createMemoryArchivePack` produces a deterministic `MemoryArchivePack` manifest
that describes a set of memory records packed into a canonical JSONL bundle.
No compression, no GitHub API calls, no direct `.forge` writes occur here —
this is a boundary manifest only.

## API

```typescript
import {
  createMemoryArchivePack,
  validateMemoryArchivePack,
  verifyMemoryArchivePack,
  MEMORY_ARCHIVE_PACK_VERSION,
  MEMORY_ARCHIVE_PACK_SCHEMA_REF,
} from "@forgeroot/memory";
```

### `createMemoryArchivePack(input)`

| Field | Type | Required | Notes |
|---|---|---|---|
| `source.task_id` | `string` | Yes | Must start with `T` |
| `source.source_artifacts` | `string[]` | Yes | Non-empty; each must be `sha256:<64 hex>` |
| `source.repository` | `string` | No | Defaults to `null` |
| `records` | `MemoryArchiveRecordRef[]` | Yes | Non-empty; deduped by `record_id` |

Returns `{ ok: true, pack: MemoryArchivePack }` or `{ ok: false, errors: string[] }`.

### `validateMemoryArchivePack(value)`

Validates an existing manifest against the schema. Returns `{ ok, issues? }`.

### `verifyMemoryArchivePack(pack, records)`

Re-derives the canonical JSONL hash from the supplied records and compares it
to `pack.pack.raw_jsonl_sha256`. Returns `{ ok, verified_count?, issues? }`.

## Manifest Shape

```json
{
  "manifest_version": 1,
  "schema_ref": "urn:forgeroot:memory-archive-pack:v1",
  "pack_id": "forge-memory-pack://...",
  "created_at": "2026-01-01T00:00:00.000Z",
  "pack": {
    "kind": "episode_digest | working_memory | mixed",
    "format": "jsonl.zst",
    "compression": "zstd",
    "compression_performed": false,
    "record_count": 2,
    "raw_jsonl_sha256": "sha256:<64 hex>",
    "compressed_sha256": null,
    "deterministic_ordering": true
  },
  "source": {
    "repository": "owner/repo",
    "task_id": "T032",
    "source_artifacts": ["sha256:<64 hex>"]
  },
  "records": [
    {
      "record_id": "ep-001",
      "record_type": "episode_digest",
      "source_ref": "T031:audit-001",
      "artifact_sha256": "sha256:<64 hex>",
      "raw_sha256": "sha256:<64 hex>"
    }
  ],
  "guards": {
    "no_destructive_delete": true,
    "source_refs_required": true,
    "deterministic_record_ordering": true,
    "runtime_db_not_authority": true,
    "no_github_api_call": true,
    "no_eval_score_update": true,
    "no_federation": true
  },
  "provenance": {
    "generated_by": "forgeroot-memory.packer",
    "task": "T032"
  }
}
```

## Determinism

- Records are sorted by `record_id` (lexicographic).
- Duplicate `record_id` values are deduplicated (first-occurrence wins).
- `raw_jsonl_sha256` is the SHA256 of the canonical JSONL: one deterministic
  JSON line per record (keys recursively sorted), joined by `\n`, trailing `\n`.
- Same records in any input order always produce the same `raw_jsonl_sha256`.

## Pack Kind Inference

| Condition | `kind` |
|---|---|
| All records are `episode_digest` | `"episode_digest"` |
| All records are `working_memory_update` | `"working_memory"` |
| Mixed record types | `"mixed"` |

## Safety Constraints

- `compression_performed` is always `false` — actual zstd compression is a
  follow-up operation performed outside this boundary.
- `compressed_sha256` is always `null` — set after compression.
- No GitHub API calls, no `.forge` direct writes, no runtime DB access.
- Keys matching secret patterns (TOKEN, SECRET, PASSWORD, PRIVATE_KEY,
  CREDENTIAL — suffix/exact match) are rejected.
- Keys indicating destructive operations (DELETE, REMOVE, PURGE, WIPE, DROP,
  DESTROY — substring match, excluding `no_*` guard prefixes) are rejected.
