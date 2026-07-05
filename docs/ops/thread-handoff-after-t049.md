# ForgeRoot Thread Handoff: after T049

Date: 2026-07-05 UTC

## Completed Task

T049 - N-version audit routing.

## What T049 Added

- `packages/mutate/src/audit-routing.ts` deterministic dry-run audit routing
  API:
  `createNVersionAuditRouting` / `validateNVersionAuditRouting`.
- `packages/mutate/tests/audit-routing.test.mjs` coverage for high-risk Class C
  proposal validation, canonical agent target paths, independent reviewer
  routing, conflicted reviewer exclusion, focus coverage, quorum bounds,
  deterministic replay, cloned return values, read-back tamper rejection, and
  aliases.
- `docs/specs/n-version-audit-routing.md` and
  `docs/specs/t049-validation-report.md`.
- `packages/mutate` exports for T049 aliases:
  `routeNVersionAudit`, `runNVersionAuditRouting`,
  `runT049NVersionAuditRouting`, and
  `validateT049NVersionAuditRouting`.
- Windows-compatible path derivation in build scripts for
  `approval-checkpoint`, `auditor`, `github-pr-adapter`, and `rate-governor`
  so root `npm test` can run on this workspace without `D:\D:\...` paths.

## Boundary

T049 is dry-run and manifest-only. It never notifies reviewers, starts audit
jobs, writes files, calls GitHub APIs, makes EvolutionGuard decisions, approves,
merges, or executes mutation proposals.

Every accepted routing manifest is Class C with human review required before
execution and merge. EvolutionGuard handoff waits for all routed reviews.

## Verification

- `npm.cmd --prefix packages\mutate test` - 47/47 passing.
- `npm.cmd test` - all npm workspace tests passing.
- `git diff --check` - passing.
- `cargo test --workspace --locked` - not run; `cargo` is not available on
  PATH in this environment.

Note: the sandboxed run hit `EPERM` while writing `packages/mutate/dist`, so the
same command was rerun with sandbox escalation and passed. Root npm verification
also required sandbox escalation for generated `dist/` writes.

## Recommended Next Target

T050 - EvolutionGuard decision manifest: consume high-risk mutation proposal
refs plus T049 independent audit routing/review evidence and emit a deterministic
accept/reject/hold decision without executing mutations, writing `.forge`
genomes, calling GitHub APIs, approving, or merging.
