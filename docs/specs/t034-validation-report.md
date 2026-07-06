# T034 Eval Suite DSL Validation Report

Date: 2026-07-06 UTC

## Scope

T034 adds a manifest-only eval suite DSL foundation. It defines a canonical
core eval suite, documents task fixture and grader schemas, and exposes
`validateEvalSuite(input)` from `@forgeroot/eval`.

## Deliverables

- `.forge/evals/core.eval.forge` - canonical manifest-only core eval suite.
- `docs/specs/eval-suite.md` - task fixture and grader schema notes.
- `packages/eval/src/eval-suite.ts` - deterministic validation API.
- `packages/eval/tests/eval-suite.test.mjs` - validation coverage.
- `docs/specs/t034-validation-report.md` - this report.

## Safety Boundary

T034 does not execute benchmarks, execute graders, calculate fitness, select
mutations, call GitHub APIs, integrate with live CI, write runtime memory,
mutate policies or workflows, federate, or enable self-evolution.

## Acceptance Checks

- Eval suite schema is validated through `validateEvalSuite(input)`.
- Benchmark task fixtures and grader definitions are separated.
- `risk_class` is required on the suite and each task.
- `shadow_only: true` is required for the T034 boundary.
- Seeded empty bootstrap suites remain valid unless executable definitions are
  explicitly required by the caller.

## Verification

- `npm.cmd --prefix packages\eval test` - passed, 11 tests.
- `npm.cmd --prefix packages\eval run build` - passed.
- `npm.cmd run validate:skills` - passed.
- `npm.cmd test` - passed.
- `npm.cmd run build` - passed.
- `git diff --check` - passed.
- `cargo test --workspace --locked` - local command unavailable because `cargo`
  is not installed or not on PATH in this Windows session. Rust verification is
  deferred to GitHub Actions.
