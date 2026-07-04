# T047 Tool-Routing Mutator Validation Report

Date: 2026-07-04 UTC

## Scope

T047 adds `packages/mutate/src/tool-routing.ts`, a deterministic dry-run
mutator for one canonical `.forge/agents/<species>.forge` document's `tools[]`
routes.

## Safety Boundary

The mutator is manifest-only. It does not write files, call GitHub APIs,
execute tools, create MCP servers, expand external network permissions, mutate
policies or workflows, approve, merge, or update live agent genomes.

## Acceptance Checks

- The contract declares consumed/produced manifests and forbidden side effects,
  including file writes, GitHub calls, automatic merge, policy targets,
  external-network expansion, and approval weakening.
- Only canonical `.forge/agents/<species>.forge` targets are accepted.
- Target content identity must match the path and species.
- Forbidden namespaces are rejected with `forbidden_tool_namespace`.
- `max_calls` above 8 is rejected with `max_calls_budget_exceeded`.
- `timeout_ms` above 8000 is rejected with `timeout_budget_exceeded`.
- `mode: "network"` is rejected with `external_network_mode_forbidden`.
- Approval weakening is rejected with `approval_requirement_weakening`.
- Valid add/replace permission expansions produce Class C review-gated dry-run
  manifests and call out `tool_permission_expansion`.
- Deterministic diff summaries, before/after digests, and generated IDs are
  stable across replay.
- Returned operation values and diff values are cloned before being returned.

## Verification

- `npm.cmd --prefix packages\mutate test` - 24/24 passing.
