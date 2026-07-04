# T048 Speciation Proposal Validation Report

Date: 2026-07-04 UTC

## Scope

T048 adds `packages/mutate/src/speciation.ts`, a deterministic dry-run
proposal surface for agent role split/merge lineage.

## Safety Boundary

The proposal is manifest-only. It does not write child genomes, replace parent
genomes, call GitHub APIs, execute supporting mutations, mutate policies or
workflows, approve, merge, or perform live speciation.

## Acceptance Checks

- The contract declares consumed/produced manifests and forbidden side effects,
  including silent replacement, live agent file writes, GitHub calls, and
  automatic merge.
- `split` requires exactly one parent and at least two children.
- `merge` requires at least two parents and exactly one child.
- Parent targets must be canonical `.forge/agents/<species>.forge` documents.
- Parent content identity and evolution lineage metadata must match the target.
- Child path, species, and `speciation_id` uniqueness are enforced.
- Child path/species/speciation ID reuse of a parent is rejected with
  `silent_replacement_forbidden`.
- Rationale summary, expected benefits, and risks are required.
- Class C approval metadata and both human-review gates are required.
- Supporting mutations are limited to `prompt_patch` and `tool_routing` refs
  scoped to parent or child agent paths.
- Read-back validation rejects tampered review gates, approval gates, child
  genome writes, parent replacement, GitHub calls, and auto-merge.
- Deterministic lineage events, proposal digests, and generated IDs are stable
  across replay.

## Verification

- `npm.cmd --prefix packages\mutate test` - 37/37 passing.
