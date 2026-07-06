# Archive Packer

## Purpose
T032 defines deterministic archive pack manifests for larger memory records.
It turns episode, mutation, eval, provenance, or other source-backed records
into a canonical JSONL byte stream and a verifiable `jsonl.zst` pack manifest.

## Public API
`packMemoryRecords(input)` is the registry-compatible API. It is an alias for
`createArchivePack(input)`.

`validateArchivePack(pack)` validates a pack manifest without writing files.

`canonicalArchiveJsonl(pack)` returns the uncompressed canonical JSONL stream.
The first line is always a `pack_header` record when a pack manifest is passed.

## Schema
A pack manifest includes version, schema ref, pack id, creation time, category,
header record, integrity header, sorted records, guards, and provenance.

The header record is included in the raw JSONL stream:

```json
{"category":"episodes","created_at":"2026-06-18T00:00:00.000Z","deterministic_ordering":"record_id_ordinal","pack_version":1,"record_count":2,"record_type":"pack_header","schema_ref":"urn:forgeroot:archive-pack:v1"}
```

Each archive record includes `record_id`, `kind`, `source_ref`,
`artifact_sha256`, `payload_sha256`, and a JSON payload. Record ids are sorted
ordinally and duplicates are rejected.

## Determinism rules
`created_at` must be caller-supplied. The packer never uses wall-clock defaults.
Records are sorted by `record_id`; identical records produce identical raw hash,
compressed hash, pack path, and pack id regardless of input order. Wrong-typed
caller values are preserved and rejected by validation instead of being silently
coerced.

## Integrity rules
The raw canonical JSONL and compressed zstd bytes are hashed separately. The
compressed hash determines the pack path:

```text
.forge/packs/<category>/<compressed-sha256>.jsonl.zst
```

Compression uses zstd level 7. Node.js v22.15 or newer is required for the
built-in zstd API used by this package.

## Source ref requirements
Every record requires a non-empty `source_ref`, an `artifact_sha256`, and a
payload hash. Missing sources are rejected rather than guessed.

## Forbidden behavior
No direct `.forge` writes, GitHub API calls, runtime DB authority, external
storage authority, semantic retrieval, federation, or secret storage.

## Acceptance criteria
Same records produce the same pack manifest; raw and compressed hashes are
verifiable; invalid headers, pack paths, record count mismatches, duplicate
record ids, missing source refs, hash mismatches, impossible timestamps, and
secret-like payloads fail validation.
