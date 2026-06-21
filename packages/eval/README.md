# @forgeroot/eval

Deterministic evaluation harness package.

## T045 shadow-run harness foundation

`runEvalShadowRun` consumes an eval suite manifest reference, a baseline eval result
manifest reference, and a candidate `.forge` document reference. It produces a
manifest-only dry-run report that preserves Phase 2 safety boundaries:

- no grader execution
- no authoritative score writes
- no runtime memory writes
- no GitHub API calls
- no live self-evolution

This package is intentionally a foundation for later eval DSL, benchmark,
fitness, and scheduler work; it does not make eval results authoritative.
