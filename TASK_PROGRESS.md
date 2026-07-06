# TASK_PROGRESS

## Current phase

T036 - merge outcome collector.

## Initial assessment summary

- T029 defines the memory partition and source-of-truth policy.
- T030 implements deterministic working memory update manifests.
- T031 implements deterministic episode digest manifests.
- T032 consumes source-backed memory records and emits deterministic archive
  pack manifests with canonical JSONL, zstd hashes, and pack boundaries.
- T033 consumes supplied source-backed memory artifacts and emits bounded
  retrieval context manifests that preserve source refs within a token budget.
- T034 defines manifest-only eval suite validation, benchmark task fixture
  schema, separated grader definitions, risk class, and shadow-only boundaries.
- T036 collects explicit PR outcome metadata into deterministic outcome
  manifests without guessing missing merge results.

## Selected work

Implement T036 - merge outcome collector.

## Why this work

- T037 and T042 need merge outcome facts before they can calculate or report
  fitness, trust, and risk without guessing.
- T036 is implementation-heavy and moves repository completion forward more
  directly than another docs/fixture-only step.
- It keeps GitHub API polling, score calculation, memory writes, rollback,
  federation, and self-evolution out of scope.

## Intended scope

- Add `packages/eval/src/outcomes.ts`.
- Add `packages/eval/tests/outcomes.test.mjs`.
- Export T036 APIs from `packages/eval/src/index.ts`.
- Add `docs/specs/t036-validation-report.md`.

## Verification plan

- Run `npm.cmd --prefix packages\eval test`.
- Run `npm.cmd --prefix packages\eval run build`.
- Run `npm.cmd run validate:skills`.
- Run `npm.cmd test`.
- Run `npm.cmd run build`.
- Run `git diff --check`.
- Run `cargo test --workspace --locked` when Rust is available.

## Current status

- T036 implementation complete locally.
- Verification passed: `npm.cmd --prefix packages\eval test` (22/22).
- Verification passed: `npm.cmd --prefix packages\eval run build`.
- Verification passed: `npm.cmd run validate:skills`.
- Verification passed: `npm.cmd test`.
- Verification passed: `npm.cmd run build`.
- Verification passed: `git diff --check`.
- Local Rust verification is blocked because `cargo` is not installed or not on
  PATH in this Windows session; GitHub Actions is the Rust verification surface
  for this PR.
