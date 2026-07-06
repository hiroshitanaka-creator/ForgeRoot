# TASK_PROGRESS

## Current phase

T032 - deterministic archive packer.

## Initial assessment summary

- T029 defines the memory partition and source-of-truth policy.
- T030 implements deterministic working memory update manifests.
- T031 implements deterministic episode digest manifests.
- T032 consumes source-backed memory records and emits deterministic archive
  pack manifests with canonical JSONL, zstd hashes, and pack boundaries.

## Selected work

Implement T032 - deterministic archive packer.

## Why this work

- T032 is the next missing memory dependency after T030/T031.
- T033 retrieval, T038 compaction, and T039 provenance need canonical pack
  hashes and source-ref boundaries.
- It keeps direct `.forge` writes, external storage authority, semantic
  retrieval, federation, and compaction scheduling out of scope.

## Intended scope

- Add `packages/memory/src/packer.ts`.
- Add `packages/memory/tests/packer.test.mjs`.
- Export T032 APIs from `packages/memory/src/index.ts`.
- Document archive pack boundaries under `.forge/packs/README.md` and
  `docs/specs/archive-packer.md`.
- Add `docs/specs/t032-validation-report.md`.

## Verification plan

- Run `npm.cmd --prefix packages\memory test`.
- Run `npm.cmd --prefix packages\memory run build`.
- Run `npm.cmd test`.
- Run `git diff --check`.
- Run `cargo test --workspace --locked` when Rust is available.

## Current status

- T032 implementation complete locally.
- Verification passed: `npm.cmd --prefix packages\memory run build`.
- Verification passed: `npm.cmd --prefix packages\memory test` (197/197).
- Verification passed: `npm.cmd test`.
- Verification passed: `npm.cmd run build`.
- Verification passed: `git diff --check`.
- Local Rust verification is blocked by Windows linker setup; GitHub Actions is
  the Rust verification surface for this PR.
