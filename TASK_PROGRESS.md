# TASK_PROGRESS

## Current phase

T034 - eval suite DSL.

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

## Selected work

Implement T034 - eval suite DSL.

## Why this work

- T042 needs score provenance before it can explain fitness, trust, or risk.
- T035-T037 need a reusable suite and grader boundary before fixtures and
  scoring can be added safely.
- It keeps benchmark execution, fitness calculation, mutation selection, live
  CI integration, federation, and self-evolution out of scope.

## Intended scope

- Add `.forge/evals/core.eval.forge`.
- Add `docs/specs/eval-suite.md`.
- Add `packages/eval/src/eval-suite.ts`.
- Add `packages/eval/tests/eval-suite.test.mjs`.
- Export T034 APIs from `packages/eval/src/index.ts`.
- Document eval suite boundaries in `packages/eval/README.md`.
- Add `docs/specs/t034-validation-report.md`.

## Verification plan

- Run `npm.cmd --prefix packages\eval test`.
- Run `npm.cmd --prefix packages\eval run build`.
- Run `npm.cmd test`.
- Run `npm.cmd run build`.
- Run `git diff --check`.
- Run `cargo test --workspace --locked` when Rust is available.

## Current status

- T034 implementation complete locally.
- Verification passed: `npm.cmd --prefix packages\eval test` (11/11).
- Verification passed: `npm.cmd --prefix packages\eval run build`.
- Verification passed: `npm.cmd run validate:skills`.
- Verification passed: `npm.cmd test`.
- Verification passed: `npm.cmd run build`.
- Verification passed: `git diff --check`.
- Local Rust verification is blocked because `cargo` is not installed or not on
  PATH in this Windows session; GitHub Actions is the Rust verification surface
  for this PR.
