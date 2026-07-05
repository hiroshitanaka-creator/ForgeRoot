# T051 Mutation PR Generator Validation Report

Date: 2026-07-05 UTC

## Scope

T051 adds `packages/mutate/src/mutation-pr-generator.ts`, a deterministic
manifest-only PR planning surface for accepted T050 EvolutionGuard decisions.

## Safety Boundary

The generator does not create branches, push commits, call GitHub APIs, write
files, write approval records, execute mutations, approve, merge, or
auto-merge.

## Acceptance Checks

- The contract declares consumed/produced manifests and forbidden side effects.
- Ready PR manifests require a valid T050 EvolutionGuard decision with
  `evolution_guard_accept`.
- Hold, reject, and invalid guard decisions are blocked before PR metadata is
  produced.
- Tampered accepted guards are rejected by T050 read-back validation.
- Draft PR metadata uses safe `codex/*` head branches and cannot target the
  base/default branch.
- Repository names, labels, reviewers, target paths, Class C review gates,
  side-effect flags, plan IDs, and plan digests are validated on read-back.
- Terminal blocked/invalid results cannot carry PR metadata.
- Returned proposal and scope metadata are cloned before returning.
- Compatibility aliases are exported:
  `createMutationPrManifest`, `generateMutationPrManifest`,
  `runT051MutationPrGenerator`, `validateMutationPrManifest`, and
  `validateT051MutationPrGenerator`.

## Verification

- `npm.cmd --prefix packages\mutate test` - 63/63 passing after T051 addition.
- `npm.cmd test` - all npm workspace tests passed.
- `git diff --check` - passed.
- `cargo test --workspace --locked` - not run because `cargo` is not available
  on PATH in this environment.

## Environment Note

The package build writes generated files under `packages/mutate/dist`. In this
workspace, sandboxed runs can fail with `EPERM` on `dist` writes, so package and
root npm verification may require sandbox escalation.
