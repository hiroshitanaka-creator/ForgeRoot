# T043 validation report — eval suite foundation

Date: 2026-06-21 UTC

## Scope

T043 creates the first canonical `.forge/evals/` surface and a seeded root `eval_suite` genome file. This is a manifest-only bootstrap for later eval scoring, selection-pressure reporting, and self-evolution gating.

## Deliverables

- `.forge/evals/root.forge` — seeded root eval suite genome.
- `docs/specs/fixtures/forge-v1/valid/root-eval-suite.forge` — conformance fixture matching the seeded eval suite shape.
- `crates/forge-kernel/src/validate.rs` — path-aware validation for `.forge/evals/<suite>.forge`.
- `crates/forge-kernel/tests/conformance.rs` — eval-suite path validation coverage.

## Boundary checks

T043 does not:

- calculate eval or fitness scores,
- mutate memory entries,
- call GitHub APIs,
- mutate workflows, policies, branch protection, or rulesets,
- implement federation or self-evolution behavior.

Missing eval task, grader, metric, and score values remain `unknown` or empty unless a later bounded task adds sourced evidence.

## Acceptance criteria

| Criterion | Result |
| --- | --- |
| `.forge/evals/` canonical structure exists | pass |
| Root `eval_suite` genome file exists and parses | pass |
| Path-aware validator recognizes `.forge/evals/<suite>.forge` | pass |
| Mismatched eval suite path/name is rejected | pass |
| Manifest-only guards are present | pass |

## Validation commands

```text
cargo test --manifest-path crates/forge-kernel/Cargo.toml
```
