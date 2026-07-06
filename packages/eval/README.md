# @forgeroot/eval

Deterministic evaluation harness package.

## T034 eval suite DSL

`validateEvalSuite` validates manifest-only eval suite definitions before any
benchmark runner or scoring surface exists. It checks:

- eval suite schema fields
- benchmark task fixture references
- separated grader definitions
- explicit `risk_class`
- `shadow_only: true`

The validator does not execute benchmark fixtures, run graders, calculate
fitness, select mutations, or integrate with live CI.

## T045 shadow-run harness foundation

`runEvalShadowRun` consumes an eval suite manifest reference, a baseline eval result
manifest reference, and a candidate `.forge` document reference. It produces a
manifest-only dry-run report that preserves Phase 2 safety boundaries:

- no grader execution
- no authoritative score writes
- no runtime memory writes
- no GitHub API calls
- no live self-evolution

This package is intentionally a foundation for later benchmark, fitness, and
scheduler work; it does not make eval results authoritative.
