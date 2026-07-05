# T050 EvolutionGuard Validation Report

Date: 2026-07-05 UTC

## Scope

T050 adds `packages/mutate/src/evolution-guard.ts`, a deterministic
decision-only EvolutionGuard manifest for high-risk Class C mutation proposal
refs after T049 independent audit routing.

## Safety Boundary

The guard manifest is decision-only. It does not execute mutations, write
`.forge` files, call GitHub APIs, notify reviewers, start audit jobs, write
approval records, approve, merge, or auto-merge.

## Acceptance Checks

- The contract declares consumed manifests, produced decision manifests, and
  forbidden side effects.
- Accepted inputs must use T049 `routing_ready` manifests with matching
  proposal identity and target paths.
- Review evidence must match routed reviewer IDs, independence keys, routing
  digests, and target paths.
- Every routed review must be present before `evolution_guard_accept`.
- Explicit reviewer rejection produces `evolution_guard_reject`.
- Any high, critical, or explicitly blocking finding produces
  `evolution_guard_reject`.
- Review finding summaries reject token/private-key material and invalid
  terminal manifests do not echo the unsafe summary value.
- Missing routed reviews, reviewer hold requests, or unmet approval quorum
  produce `evolution_guard_hold`.
- Read-back validation rejects tampered side-effect flags, weakened guardrails,
  stale guard IDs, stale guard digests, unknown review routes, duplicate review
  routes, and accepted manifests carrying missing reviews.
- Returned proposal and review evidence are cloned before returning.
- Compatibility aliases are exported:
  `evaluateEvolutionGuard`, `createEvolutionGuardDecision`,
  `runT050EvolutionGuard`, and `validateT050EvolutionGuardDecision`.

## Verification

- `npm.cmd --prefix packages\mutate test` - 56/56 passing after T050 addition.
- PR #18 self-audit rerun: `npm.cmd --prefix packages\mutate test` - 104/104
  passing across T046-T060 after secret-material hardening.
- `npm.cmd test` - all npm workspace tests passed.
- `git diff --check` - passed.
- `cargo test --workspace --locked` - not run because `cargo` is not available
  on PATH in this environment.

## Environment Note

The package build writes generated files under `packages/mutate/dist`. In this
workspace, sandboxed runs can fail with `EPERM` on `dist` writes, so package and
root npm verification may require sandbox escalation.
