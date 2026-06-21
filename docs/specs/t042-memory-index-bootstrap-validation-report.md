# T042 validation report — memory index bootstrap

Date: 2026-06-21 UTC

## Scope

T042 creates the first canonical `.forge/memory/` surface and a seeded root `memory_index` genome file. This is a manifest-only bootstrap for later memory/eval/provenance reporting.

## Deliverables

- `.forge/memory/root.forge` — seeded root memory index genome.
- `docs/specs/fixtures/forge-v1/valid/root-memory-index.forge` — conformance fixture matching the seeded index shape.
- `crates/forge-kernel/src/validate.rs` — path-aware validation for `.forge/memory/<index>.forge`.
- `crates/forge-kernel/tests/conformance.rs` — memory-index path validation coverage.

## Boundary checks

T042 does not:

- write runtime memory entries,
- calculate eval or fitness scores,
- call GitHub APIs,
- mutate workflows, policies, branch protection, or rulesets,
- implement federation or self-evolution behavior.

Missing runtime memory, pack, eval, and provenance values remain `unknown` unless a later bounded task adds sourced evidence.

## Acceptance criteria

| Criterion | Result |
| --- | --- |
| `.forge/memory/` canonical structure exists | pass |
| Root `memory_index` genome file exists and parses | pass |
| Path-aware validator recognizes `.forge/memory/<index>.forge` | pass |
| Mismatched memory index path/name is rejected | pass |
| Manifest-only guards are present | pass |

## Validation commands

```text
cargo test --manifest-path crates/forge-kernel/Cargo.toml
```
