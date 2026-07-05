# T049 N-version Audit Routing Validation Report

Date: 2026-07-05 UTC

## Scope

T049 adds `packages/mutate/src/audit-routing.ts`, a deterministic dry-run
routing manifest for high-risk Class C mutation proposals that need independent
N-version review before T050 EvolutionGuard decisions.

## Safety Boundary

The routing manifest is dry-run only. It does not notify reviewers, start audit
jobs, write files, call GitHub APIs, make EvolutionGuard decisions, approve,
merge, or execute mutation proposals.

## Acceptance Checks

- The contract declares consumed/produced manifests and forbidden side effects,
  including reviewer notification, audit execution, EvolutionGuard decisions,
  file writes, GitHub calls, and automatic merge.
- Accepted proposals must be high-risk and Class C.
- Accepted mutation classes are limited to `prompt_patch`, `tool_routing`, and
  `speciation`.
- Proposal target paths must be canonical `.forge/agents/<species>.forge`
  documents.
- Reviewer routes require distinct reviewer IDs and distinct
  `independence_key` values.
- Required audit focuses must be covered by selected independent reviewers.
- Conflicted reviewer candidates are excluded from accepted routes.
- The quorum requires all routed reviews before EvolutionGuard handoff.
- Read-back validation rejects tampered review gates, reviewer notification
  flags, audit job flags, EvolutionGuard decision flags, duplicate
  independence keys, missing target assignments, stale route IDs, stale routing
  digests, invalid quorum handoff, rejected manifests carrying routes, and
  malformed route entries.
- Deterministic routing IDs, route IDs, route ordering, and digests are stable
  across replay.
- Returned proposal, policy, and route metadata are cloned before returning.
- Compatibility aliases are exported:
  `routeNVersionAudit`, `runNVersionAuditRouting`,
  `runT049NVersionAuditRouting`, and `validateT049NVersionAuditRouting`.
- Windows execution of root `npm test` is preserved by using Node's
  `fileURLToPath` in package build scripts that derive paths from
  `import.meta.url`.

## Verification

- `npm.cmd --prefix packages\mutate test` - 47/47 passing after T049 addition.
- `npm.cmd test` - all npm workspace tests passed after the Windows build
  script path repair.
- `git diff --check` - passed.
- `cargo test --workspace --locked` - not run because `cargo` is not available
  on PATH in this environment.

## Environment Note

The package build writes generated files under `packages/mutate/dist`. In this
workspace, the first sandboxed run failed with `EPERM` on `dist` writes, so the
same command was rerun with sandbox escalation and passed. Root `npm test` also
requires sandbox escalation here because workspace builds update tracked
`dist/` files during verification.
