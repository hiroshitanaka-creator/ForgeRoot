# TASK_PROGRESS

## Current phase

T033 - semantic retrieval adapter.

## Initial assessment summary

- T029 defines the memory partition and source-of-truth policy.
- T030 implements deterministic working memory update manifests.
- T031 implements deterministic episode digest manifests.
- T032 consumes source-backed memory records and emits deterministic archive
  pack manifests with canonical JSONL, zstd hashes, and pack boundaries.
- T033 consumes supplied source-backed memory artifacts and emits bounded
  retrieval context manifests that preserve source refs within a token budget.

## Selected work

Implement T033 - semantic retrieval adapter.

## Why this work

- T033 is the next missing memory dependency after T030/T031/T032.
- T042 can show memory context only if retrieval preserves source refs and
  bounded token usage instead of guessing missing memory.
- It keeps embedding providers, vector DB authority, direct `.forge` writes,
  federation, and memory mutation out of scope.

## Intended scope

- Add `packages/memory/src/retrieval.ts`.
- Add `packages/memory/tests/retrieval.test.mjs`.
- Export T033 APIs from `packages/memory/src/index.ts`.
- Document retrieval boundaries in `packages/memory/README.md`.
- Add `docs/specs/t033-validation-report.md`.

## Verification plan

- Run `npm.cmd --prefix packages\memory test`.
- Run `npm.cmd --prefix packages\memory run build`.
- Run `npm.cmd test`.
- Run `npm.cmd run build`.
- Run `git diff --check`.
- Run `cargo test --workspace --locked` when Rust is available.

## Current status

- T033 implementation complete locally.
- Verification passed: `npm.cmd --prefix packages\memory run build`.
- Verification passed: `npm.cmd --prefix packages\memory test` (205/205).
- Verification passed: `npm.cmd test`.
- Verification passed: `npm.cmd run build`.
- Verification passed: `git diff --check`.
- Local Rust verification is blocked by Windows linker setup; GitHub Actions is
  the Rust verification surface for this PR.
