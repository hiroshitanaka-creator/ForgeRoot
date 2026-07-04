# TASK_PROGRESS

## Current phase

T048 - Role split/merge speciation proposal.

## Initial assessment summary

- PR #14 merged T047 tool-routing mutator into `origin/main`.
- The latest T047 handoff recommends T048 as the next target.
- The blueprint interface registry defines the T048 package API as
  `createSpeciationProposal(input)`.
- T048 is Class C / high risk because role split/merge changes agent lineage,
  so the implementation must remain manifest-only and must not create child
  genomes, replace parent genomes, write `.forge` files, call GitHub APIs,
  approve, or merge.

## Selected work

Implement T048 - Role split/merge speciation proposal.

## Why this work

- It advances the Evolution loop after T046 prompt patching and T047
  tool-routing by adding explicit lineage proposals.
- It gives later EvolutionGuard and lineage-threshold work a concrete
  speciation manifest to inspect.
- It keeps live role mutation, child genome creation, parent replacement,
  GitHub transport, approval, and merge out of scope.

## Intended scope

- Add `packages/mutate/src/speciation.ts`.
- Add `packages/mutate/tests/speciation.test.mjs`.
- Export T048 APIs from `packages/mutate/src/index.ts`.
- Document the T048 schema and validation result under `docs/specs/`.
- Add `docs/ops/thread-handoff-after-t048.md`.

## Verification plan

- Run `npm.cmd --prefix packages\mutate test`.
- Run `git diff --check origin/main...HEAD`.

## Current status

- T048 implementation complete.
- Verification passed: `npm.cmd --prefix packages\mutate test` (38/38 after
  second PR review fixes).
- Ready for PR #15 update.
