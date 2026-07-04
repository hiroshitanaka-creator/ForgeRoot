# ForgeRoot Thread Handoff: after T047

Date: 2026-07-04 UTC

## Completed Task

T047 - Tool-routing mutator.

## What T047 Added

- `packages/mutate/src/tool-routing.ts` deterministic dry-run tool-routing
  mutator:
  `applyToolRoutingDryRun` / `validateToolRoutingDryRun`.
- `packages/mutate/tests/tool-routing.test.mjs` coverage for:
  namespace allowlisting, budget caps, approval escalation, approval weakening
  rejection, external-network mode rejection, deterministic diff summaries,
  canonical target identity validation, route add/replace/remove behavior, and
  cloned returned values.
- `docs/specs/tool-routing-mutation.md` and
  `docs/specs/t047-validation-report.md`.
- `packages/mutate` exports for T047 aliases:
  `runToolRoutingDryRun`, `runT047ToolRoutingDryRun`, and
  `validateT047ToolRoutingDryRun`.

## Boundary

T047 is dry-run and manifest-only. It never writes `.forge` files, calls GitHub
APIs, executes tools, creates MCP servers, expands external network
permissions, mutates policies or workflows, approves, merges, or performs live
agent mutation.

Every accepted tool-routing proposal is Class C with human review required
before execution and merge. Approval weakening is rejected rather than
escalated.

## Verification

- `npm.cmd --prefix packages\mutate test` - 24/24 passing.

## Recommended Next Target

T048 - Role split/merge mechanism: define a dry-run-only proposal surface for
agent role split/merge lineage with parent/child/rationale/approval metadata,
building on T046 prompt patch and T047 tool-routing mutation manifests without
performing live speciation.
