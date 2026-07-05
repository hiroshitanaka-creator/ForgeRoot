# T052 validation report

Task: T052 mutation PR transport request bridge

## Scope

- Added `packages/mutate/src/mutation-pr-transport.ts`.
- Added `packages/mutate/tests/mutation-pr-transport.test.mjs`.
- Exported T052 APIs from `packages/mutate/src/index.ts`.
- Updated package and docs indexes for the T052 dry-run transport request
  surface.

## Validation performed

- `npm.cmd --prefix packages\mutate test`
  - Result: passed.
  - Coverage: 69 tests across T046-T052 mutate package suites.

## Safety checks covered by tests

- T052 contract declares deterministic dry-run transport planning only.
- Ready transport requests require a validated T051 `pr_manifest_ready` plan.
- Non-ready valid T051 plans produce blocked terminal output with no request
  metadata.
- Tampered T051 manifests, unsafe repositories, bad dry-run flags, and invalid
  transport manifests are rejected.
- Transport read-back validation rejects token-like strings, merge endpoints,
  default head branches, stale digests, guard weakening, and terminal results
  carrying request metadata.

## Not run locally

- `cargo test --workspace --locked` was not run because `cargo` is not available
  on PATH in this environment.
- Root `npm.cmd test` and `git diff --check` are pending for the wider task
  batch after the next implementation step.
