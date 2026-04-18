# Plan Spec fixtures

T016 fixtures for `packages/planner/src/plan-schema.ts`.

- `valid/docs-plan.json` — generated from one accepted `forge:auto` docs issue.
- `invalid/missing-machine-check.json` — intentionally invalid because an acceptance criterion lacks a typed `check` object.

The fixtures are JSON because Plan Specs are runtime planner contracts rather than `.forge` genome files.
