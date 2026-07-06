# Forge Packs

`.forge/packs` stores immutable, content-addressed sidecar archive packs for
large or old memory records. Inline `.forge` memory remains small and curated;
bulk episode, mutation, eval, and provenance payloads belong in packs.

## Pack format

T032 pack manifests use canonical JSONL compressed with zstd:

- uncompressed stream: first line is a `pack_header` record
- following lines: deterministic archive records sorted by `record_id`
- compression: zstd level 7
- path: `.forge/packs/<category>/<compressed-sha256>.jsonl.zst`
- integrity: both raw JSONL and compressed bytes have `sha256:<64 hex>` hashes

## Source of truth

Pack files and pack references become source of truth only after PR review and
merge. Runtime databases, caches, vector indexes, and object stores are derived
state and must be rebuilt from committed repository artifacts.

## Forbidden behavior

The packer must not write directly to `.forge`, call GitHub APIs, use external
object storage as authority, guess missing source refs, or store secrets.

Corrections create a new pack and update references by PR; existing packs are
immutable.
