# TASK_PROGRESS

## Current phase
T043 — Eval suite foundation (manifest-only Phase 2 genome surface).

## Initial assessment summary
- ForgeRoot's non-negotiable architecture remains Git source of truth, `.forge` genome/memory, PR-native evolution, and GitHub App + sandbox circulation.
- Phase 1 deterministic manifest chain is implemented through T028 across planner, executor, auditor, PR composer, GitHub PR adapter, approval checkpoint, rate governor, and forge demo packages.
- Later safety/docs work exists for T040/T041, and T042 bootstrapped `.forge/memory/root.forge` plus forge-kernel path-aware validation for memory indexes.
- The T042 handoff recommends T043 as the next target: eval suite foundation.

## Selected work
Implement T043 — Eval suite foundation.

## Why this work
- The blueprint requires selection pressure/evaluation before self-evolution.
- T043 is the safest next step after T042 because it is manifest-only and validator-focused.
- It avoids workflow, policy, permission, branch protection, live transport, federation, and self-evolution changes.

## Intended scope
- Create `.forge/evals/root.forge` as the seeded root eval suite genome.
- Add a valid fixture for the eval suite shape.
- Extend forge-kernel path-aware validation for `.forge/evals/<suite>.forge`.
- Add conformance tests for valid placement and path/name mismatch rejection.
- Add validation report and handoff docs.

## Verification plan
- Run `cargo test --manifest-path crates/forge-kernel/Cargo.toml`.

## Current status
- Initial assessment complete.
- T043 implementation complete: seeded eval suite genome, fixture, path-aware validator support, conformance tests, validation report, and handoff docs added.
- Verification passed: `cargo test --manifest-path crates/forge-kernel/Cargo.toml`.
- Ready for commit and PR record.
