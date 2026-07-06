# T036 Merge Outcome Collector Validation Report

Date: 2026-07-06 UTC

## Scope

T036 adds `collectMergeOutcome(input)` to `@forgeroot/eval`. The collector
normalizes explicit PR metadata, review outcome, CI outcome, revert linkage,
quarantine evidence, stale evidence, task refs, and commit trailer refs into a
deterministic outcome manifest.

## Deliverables

- `packages/eval/src/outcomes.ts` - merge outcome collector and validator.
- `packages/eval/tests/outcomes.test.mjs` - behavior tests.
- `docs/specs/t036-validation-report.md` - this report.

## Safety Boundary

T036 does not poll GitHub APIs, guess missing outcomes, calculate scores, write
memory, perform rollbacks, mutate workflows or policies, federate, or
self-evolve.

## Acceptance Checks

- Merged, rejected, stale, reverted, and quarantined outcomes are distinguishable.
- Source PR metadata, task refs, and commit trailer refs are required.
- Missing explicit outcome evidence produces `unknown` instead of an inferred
  outcome.
- Collector guards assert no GitHub API calls, no outcome guessing, no score
  calculation, no memory writes, and no auto rollback.

## Verification

- `npm.cmd --prefix packages\eval test` - passed, 22 tests.
- `npm.cmd --prefix packages\eval run build` - passed.
- `npm.cmd run validate:skills` - passed.
- `npm.cmd test` - passed.
- `npm.cmd run build` - passed.
- `git diff --check` - passed.
- `cargo test --workspace --locked` - local command unavailable because `cargo`
  is not installed or not on PATH in this Windows session. Rust verification is
  deferred to GitHub Actions.
