# @forgeroot/memory

Phase 2 memory foundation package for deterministic, auditable manifest artifacts.

This package creates and validates:

- `working_memory_update` manifests
- `episode_digest` manifests
- archive pack manifests through `packMemoryRecords(input)`

Archive packs are deterministic `jsonl.zst` manifests with a first-line
`pack_header`, raw and compressed SHA-256 hashes, zstd level 7 metadata, and
content-addressed `.forge/packs/<category>/<hash>.jsonl.zst` paths.

It does not write `.forge`, call GitHub APIs, implement MemoryKeeper, compute
eval scores, build vector indexes, run compaction, use external object storage
as authority, or treat runtime databases as source of truth.
