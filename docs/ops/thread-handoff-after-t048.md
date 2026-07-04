# ForgeRoot Thread Handoff: after T048

Date: 2026-07-04 UTC

## Completed Task

T048 - Role split/merge speciation proposal.

## What T048 Added

- `packages/mutate/src/speciation.ts` deterministic dry-run speciation
  proposal API:
  `createSpeciationProposal` / `validateSpeciationProposal`.
- `packages/mutate/tests/speciation.test.mjs` coverage for split/merge
  cardinality, parent identity validation, child uniqueness, silent replacement
  rejection, Class C gates, dry-run side-effect flags, deterministic replay,
  cloning, and aliases.
- `docs/specs/speciation-proposal.md` and
  `docs/specs/t048-validation-report.md`.
- `packages/mutate` exports for T048 aliases:
  `runSpeciationProposal`, `runT048SpeciationProposal`, and
  `validateT048SpeciationProposal`.

## Boundary

T048 is dry-run and manifest-only. It never writes child genomes, replaces
parent genomes, calls GitHub APIs, executes supporting mutations, mutates
policies or workflows, approves, merges, or performs live speciation.

Every accepted proposal is Class C with human review required before execution
and merge. Silent replacement of a parent path, species, or `speciation_id` is
rejected.

## Verification

- `npm.cmd --prefix packages\mutate test` - 37/37 passing.

## Recommended Next Target

T049 - N-version audit routing: define the bounded routing manifest that sends
high-risk mutation proposals to independent reviewers before T050
EvolutionGuard can accept or reject them.
