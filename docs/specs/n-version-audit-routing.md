# T049 N-version Audit Routing

## Purpose

N-version audit routing records how a high-risk Class C mutation proposal is
sent to independent reviewers before EvolutionGuard can make an acceptance
decision.

The canonical package API is `createNVersionAuditRouting(input)`.

## Shape

```ts
type NVersionAuditFocus =
  | "architecture"
  | "security"
  | "state"
  | "lineage"
  | "tests";

interface NVersionAuditProposalRef {
  proposal_id: string;
  mutation_id: string;
  mutation_class: "prompt_patch" | "tool_routing" | "speciation";
  risk: "high";
  approval_class: "C";
  target_paths: string[];
  source_digest: string;
}

interface NVersionAuditReviewerCandidate {
  reviewer_id: string;
  independence_key: string;
  focuses: NVersionAuditFocus[];
  max_parallel_assignments: number;
  conflict_paths?: string[];
}

interface NVersionAuditRoutingPolicy {
  min_reviewers: number;
  required_quorum: number;
  required_focuses: NVersionAuditFocus[];
}
```

## Routing Rules

- The proposal must be high-risk and Class C.
- `mutation_class` is limited to `prompt_patch`, `tool_routing`, or
  `speciation`.
- Target paths must be canonical `.forge/agents/<species>.forge` documents.
- `min_reviewers` and `required_quorum` must both be at least 2.
- `required_quorum` must not exceed `min_reviewers`.
- Selected reviewer routes must use distinct `independence_key` values.
- Required audit focuses must be covered by the selected reviewer routes.
- Reviewer candidates whose `conflict_paths` overlap proposal target paths are
  excluded from accepted routes.

## Output Guarantees

An accepted routing manifest includes:

- deterministic `routing_id`
- deterministic per-reviewer `route_id`
- one reviewer route per selected independent reviewer
- quorum metadata that waits for all routed reviews before EvolutionGuard
  handoff
- Class C review gate metadata
- `routing_digest` covering the proposal, routes, quorum, and review gate

Read-back validation rejects route ID mismatch, duplicate reviewer IDs,
duplicate independence keys, missing target assignments, stale routing digests,
downgraded review gates, side-effect flags, invalid quorum handoff, and
accepted manifests carrying validation issues.

## Safety Boundary

T049 is manifest-only. It never notifies reviewers, starts audit jobs, writes
files, calls GitHub APIs, makes EvolutionGuard decisions, approves, merges, or
executes mutation proposals.

## Out Of Scope

Reviewer identity management, live notification, audit execution, audit result
collection, EvolutionGuard acceptance or rejection, GitHub transport, policy
mutation, workflow mutation, approval execution, and merge are outside T049.
