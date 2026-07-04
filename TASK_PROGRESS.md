# TASK_PROGRESS

## Current phase

T047 - Tool-routing mutator (allowlisted, dry-run tool route mutation surface).

## Initial assessment summary

- PR #8 merged T046 prompt genome patcher into `origin/main`.
- The latest T046 handoff recommends T047 as the next target.
- The canonical task source in the continuation issue file defines T047 as a bounded
  mutation surface for agent tool namespace, `max_calls`, timeout, and approval
  requirements.
- T047 is Class C / high risk by task definition, so the implementation must
  remain manifest-only and must not perform live tool execution, `.forge`
  writes, policy changes, workflow changes, GitHub transport, approval, or
  merge.

## Selected work

Implement T047 - Tool-routing mutator.

## Why this work

- It advances the Evolution loop's mutation proposal layer after T046 while
  preserving explicit human review gates.
- It gives later speciation and EvolutionGuard work a concrete tool-routing
  manifest to inspect.
- It keeps tool implementation, MCP server implementation, external network
  permission expansion, and policy weakening out of scope.

## Intended scope

- Add `packages/mutate/src/tool-routing.ts`.
- Add `packages/mutate/tests/tool-routing.test.mjs`.
- Export T047 APIs from `packages/mutate/src/index.ts`.
- Document the T047 schema and validation result under `docs/specs/`.
- Add `docs/ops/thread-handoff-after-t047.md`.

## Verification plan

- Run `npm.cmd --prefix packages\mutate test`.
- Run `git diff --check origin/main...HEAD`.

## Current status

- T047 implementation complete.
- Verification passed: `npm.cmd --prefix packages\mutate test` (24/24).
- Ready for commit and draft PR record.
