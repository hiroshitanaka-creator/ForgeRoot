# T050 EvolutionGuard Decision Manifest

## Purpose

EvolutionGuard consumes a high-risk Class C mutation proposal ref, a T049
N-version audit routing manifest, and independent review evidence. It produces
a deterministic decision manifest for the next mutation PR generation stage.

The canonical package API is `runEvolutionGuard(input)`.

## Input Shape

```ts
interface EvolutionGuardReviewEvidence {
  route_id: string;
  reviewer_id: string;
  independence_key: string;
  decision: "approve" | "reject" | "hold";
  completed_at: string;
  routing_digest: string;
  reviewed_target_paths: string[];
  findings: EvolutionGuardFinding[];
  evidence_digest: string;
}

interface EvolutionGuardInput {
  now?: string;
  proposal: NVersionAuditProposalRef;
  routing: NVersionAuditRoutingResult;
  reviews: EvolutionGuardReviewEvidence[];
}
```

## Decision Rules

- Invalid input emits `invalid_evolution_guard_input`.
- Missing routed reviews emit `evolution_guard_hold`.
- Any high, critical, or explicitly blocking finding emits
  `evolution_guard_reject`.
- Any reviewer `reject` decision emits `evolution_guard_reject`.
- Any reviewer `hold` decision emits `evolution_guard_hold`.
- Approval quorum with all routed reviews present and no blockers emits
  `evolution_guard_accept`.

## Validation Rules

Read-back validation checks:

- proposal identity and target paths match the T049 routing manifest
- routing is T049 `routing_ready`
- review route ID, reviewer ID, independence key, routing digest, and reviewed
  target paths match the selected route and proposal
- duplicate, unknown, or missing review routes are rejected
- Class C human-review gate cannot be weakened
- dry-run side-effect flags cannot claim file writes, GitHub calls, mutation
  execution, approval-record writes, or auto-merge
- accepted manifests cannot carry missing reviews, rejects, holds, blocking
  findings, or unmet quorum
- guard IDs and guard digests are deterministic over proposal, routing ref,
  reviews, quorum, guardrails, review gate, decision, and reasons

## Safety Boundary

T050 is decision-only. It never executes mutations, writes `.forge` files,
calls GitHub APIs, writes approval records, approves, merges, notifies
reviewers, or starts audit jobs.

An accept decision allows only later mutation PR manifest generation. Mutation
execution and merge remain outside T050 and stay human-review gated.

## Out Of Scope

Reviewer notification, live audit execution, mutation PR generation, GitHub
transport, `.forge` genome writes, approval checkpoint writes, automatic merge,
branch protection changes, and policy mutation are outside T050.
