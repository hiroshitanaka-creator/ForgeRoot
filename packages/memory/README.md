# @forgeroot/memory

Phase 2 memory foundation package for deterministic, auditable manifest artifacts.

This package creates and validates:

- `working_memory_update` manifests
- `episode_digest` manifests
- archive pack manifests through `packMemoryRecords(input)`
- bounded retrieval context manifests through `retrieveMemoryContext(input)`

Archive packs are deterministic `jsonl.zst` manifests with a first-line
`pack_header`, raw and compressed SHA-256 hashes, zstd level 7 metadata, and
content-addressed `.forge/packs/<category>/<hash>.jsonl.zst` paths.

Retrieval contexts are deterministic, source-ref-preserving manifests built
from supplied memory artifacts. They estimate token usage with the documented
`char_div_4_ceil` estimator, sort by deterministic lexical relevance, and trim
within the caller-provided `token_budget`.

It does not write `.forge`, call GitHub APIs, implement MemoryKeeper, compute
eval scores, make vector indexes authoritative, run compaction, use external
object storage as authority, mutate memory, or treat runtime databases as
source of truth.
