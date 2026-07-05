import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EVOLUTION_GUARD_CONTRACT,
  createEvolutionGuardDecision,
  createNVersionAuditRouting,
  evaluateEvolutionGuard,
  runEvolutionGuard,
  runT050EvolutionGuard,
  validateEvolutionGuardDecision,
  validateT050EvolutionGuardDecision,
} from "../dist/index.js";

const NOW = "2026-07-05T00:00:00Z";

function proposal(overrides = {}) {
  return {
    proposal_id: "speciation-proposal-11111111",
    mutation_id: "mut-22222222",
    mutation_class: "speciation",
    risk: "high",
    approval_class: "C",
    target_paths: [".forge/agents/planner.alpha.forge", ".forge/agents/planner.scoper.forge"],
    source_digest: "sha-fnv1a-abcdef12",
    ...overrides,
  };
}

function reviewer(overrides = {}) {
  return {
    reviewer_id: "architecture-reviewer",
    independence_key: "org-architecture",
    focuses: ["architecture", "lineage"],
    max_parallel_assignments: 1,
    ...overrides,
  };
}

function routing(overrides = {}) {
  return createNVersionAuditRouting({
    now: NOW,
    proposal: proposal(),
    reviewers: [
      reviewer({ reviewer_id: "state-reviewer", independence_key: "org-state", focuses: ["state", "tests"] }),
      reviewer(),
      reviewer({ reviewer_id: "security-reviewer", independence_key: "org-security", focuses: ["security"] }),
      reviewer({ reviewer_id: "lineage-reviewer", independence_key: "org-lineage", focuses: ["lineage"] }),
    ],
    policy: {
      min_reviewers: 3,
      required_quorum: 2,
      required_focuses: ["architecture", "security", "lineage"],
    },
    ...overrides,
  });
}

function reviewFor(route, routingResult, index = 0, overrides = {}) {
  return {
    route_id: route.route_id,
    reviewer_id: route.reviewer_id,
    independence_key: route.independence_key,
    decision: "approve",
    completed_at: NOW,
    routing_digest: routingResult.routing_digest,
    reviewed_target_paths: routingResult.proposal.target_paths,
    findings: [],
    evidence_digest: `sha-fnv1a-abc0000${index}`,
    ...overrides,
  };
}

function input(overrides = {}) {
  const routingResult = routing();
  return {
    now: NOW,
    proposal: routingResult.proposal,
    routing: routingResult,
    reviews: routingResult.reviewer_routes.map((route, index) => reviewFor(route, routingResult, index)),
    ...overrides,
  };
}

describe("T050 EvolutionGuard", () => {
  it("declares a deterministic decision-only Class C guard contract", () => {
    assert.equal(EVOLUTION_GUARD_CONTRACT.deterministic, true);
    assert.equal(EVOLUTION_GUARD_CONTRACT.decisionOnly, true);
    assert.ok(EVOLUTION_GUARD_CONTRACT.validates.includes("all_routed_reviews_collected_before_accept"));
    assert.ok(EVOLUTION_GUARD_CONTRACT.validates.includes("blocking_findings_reject"));
    assert.ok(EVOLUTION_GUARD_CONTRACT.forbids.includes("mutation_execution"));
    assert.ok(EVOLUTION_GUARD_CONTRACT.forbids.includes("github_api_call"));
    assert.ok(EVOLUTION_GUARD_CONTRACT.forbids.includes("approval_record_write"));
  });

  it("accepts only after every routed review is present and quorum approves", () => {
    const candidate = input();
    const result = runEvolutionGuard(candidate);

    assert.equal(result.status, "decision_ready", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "evolution_guard_accept");
    assert.deepEqual(result.quorum.missing_route_ids, []);
    assert.equal(result.quorum.approval_count, 3);
    assert.equal(result.guardrails.mutation_pr_generation_allowed, true);
    assert.equal(result.guardrails.mutation_execution_authorized, false);
    assert.equal(result.guardrails.github_transport_authorized, false);
    assert.equal(result.guardrails.approval_record_written, false);
    assert.equal(result.dry_run.mutation_executed, false);
    assert.equal(result.dry_run.github_api_called, false);
    assert.equal(result.dry_run.approval_record_written, false);
    assert.equal(result.review_gate.human_review_required_before_execution, true);
    assert.deepEqual(validateEvolutionGuardDecision(result), { ok: true, issues: [] });

    const replay = runEvolutionGuard(candidate);
    assert.equal(replay.guard_id, result.guard_id);
    assert.equal(replay.guard_digest, result.guard_digest);
    assert.deepEqual(replay.quorum, result.quorum);
  });

  it("rejects any blocking or high-severity review finding", () => {
    const candidate = input();
    const result = runEvolutionGuard({
      ...candidate,
      reviews: [
        {
          ...candidate.reviews[0],
          findings: [
            {
              finding_id: "finding-11111111",
              severity: "high",
              blocking: false,
              summary: "lineage rollback evidence is missing",
            },
          ],
        },
        ...candidate.reviews.slice(1),
      ],
    });

    assert.equal(result.status, "decision_ready");
    assert.equal(result.decision, "evolution_guard_reject");
    assert.equal(result.quorum.blocking_finding_count, 1);
    assert.equal(result.guardrails.mutation_pr_generation_allowed, false);
    assert.ok(result.reasons.includes("blocking_review_finding"));
    assert.deepEqual(validateEvolutionGuardDecision(result), { ok: true, issues: [] });
  });

  it("rejects explicit reviewer rejection before PR generation is allowed", () => {
    const candidate = input();
    const result = runEvolutionGuard({
      ...candidate,
      reviews: [
        { ...candidate.reviews[0], decision: "reject" },
        ...candidate.reviews.slice(1),
      ],
    });

    assert.equal(result.decision, "evolution_guard_reject");
    assert.equal(result.quorum.rejection_count, 1);
    assert.equal(result.guardrails.mutation_pr_generation_allowed, false);
    assert.ok(result.reasons.includes("reviewer_rejection"));
    assert.deepEqual(validateEvolutionGuardDecision(result), { ok: true, issues: [] });
  });

  it("holds when any routed review is missing or a reviewer asks to hold", () => {
    const candidate = input();
    const missing = runEvolutionGuard({ ...candidate, reviews: candidate.reviews.slice(0, 2) });
    assert.equal(missing.decision, "evolution_guard_hold");
    assert.deepEqual(missing.quorum.missing_route_ids, [candidate.routing.reviewer_routes[2].route_id]);
    assert.ok(missing.reasons.includes("missing_required_reviews"));
    assert.equal(missing.guardrails.mutation_pr_generation_allowed, false);
    assert.deepEqual(validateEvolutionGuardDecision(missing), { ok: true, issues: [] });

    const held = runEvolutionGuard({
      ...candidate,
      reviews: [
        { ...candidate.reviews[0], decision: "hold" },
        ...candidate.reviews.slice(1),
      ],
    });
    assert.equal(held.decision, "evolution_guard_hold");
    assert.equal(held.quorum.hold_count, 1);
    assert.ok(held.reasons.includes("reviewer_hold"));
    assert.deepEqual(validateEvolutionGuardDecision(held), { ok: true, issues: [] });
  });

  it("marks mismatched routing, duplicate reviews, bad digests, and wrong targets invalid", () => {
    const candidate = input();
    const cases = [
      {
        name: "proposal mismatch",
        value: {
          ...candidate,
          routing: { ...candidate.routing, proposal: { ...candidate.routing.proposal, mutation_id: "mut-33333333" } },
        },
        reason: "mutation_id_mismatch",
      },
      {
        name: "routing not ready",
        value: {
          ...candidate,
          routing: { ...candidate.routing, status: "rejected", decision: "invalid_audit_routing_input" },
        },
        reason: "routing_not_ready",
      },
      {
        name: "duplicate review route",
        value: {
          ...candidate,
          reviews: [candidate.reviews[0], candidate.reviews[0], candidate.reviews[1]],
        },
        reason: "duplicate_review_route",
      },
      {
        name: "bad review digest",
        value: {
          ...candidate,
          reviews: [{ ...candidate.reviews[0], routing_digest: "sha-fnv1a-00000000" }, ...candidate.reviews.slice(1)],
        },
        reason: "review_routing_digest_mismatch",
      },
      {
        name: "tampered routing digest",
        value: {
          ...candidate,
          routing: { ...candidate.routing, routing_digest: "sha-fnv1a-00000000" },
        },
        reason: "invalid_t049_routing_manifest",
      },
      {
        name: "malformed routing route",
        value: {
          ...candidate,
          routing: { ...candidate.routing, reviewer_routes: [null] },
        },
        reason: "invalid_t049_routing_manifest",
      },
      {
        name: "wrong review targets",
        value: {
          ...candidate,
          reviews: [{ ...candidate.reviews[0], reviewed_target_paths: [candidate.proposal.target_paths[0]] }, ...candidate.reviews.slice(1)],
        },
        reason: "reviewed_target_paths_mismatch",
      },
    ];

    for (const { name, value, reason } of cases) {
      const result = runEvolutionGuard(value);
      assert.equal(result.status, "invalid", name);
      assert.equal(result.decision, "invalid_evolution_guard_input", name);
      assert.ok(result.reasons.includes(reason), `${name} -> ${JSON.stringify(result.reasons)}`);
      assert.deepEqual(validateEvolutionGuardDecision(result), { ok: true, issues: [] }, name);
    }
  });

  it("clones proposal and review evidence before returning", () => {
    const candidate = input();
    const result = runEvolutionGuard(candidate);

    candidate.proposal.target_paths.push(".forge/agents/mutated.alpha.forge");
    candidate.reviews[0].reviewed_target_paths.push(".forge/agents/mutated.alpha.forge");
    candidate.reviews[0].findings.push({
      finding_id: "finding-22222222",
      severity: "critical",
      blocking: true,
      summary: "mutated after return",
    });

    assert.deepEqual(result.proposal.target_paths, [".forge/agents/planner.alpha.forge", ".forge/agents/planner.scoper.forge"]);
    assert.deepEqual(result.reviews[0].reviewed_target_paths, result.proposal.target_paths);
    assert.deepEqual(result.reviews[0].findings, []);
    assert.equal(result.decision, "evolution_guard_accept");
  });

  it("rejects tampered guard manifests, side effects, quorum, routes, and digests", () => {
    const result = runEvolutionGuard(input());
    assert.equal(result.status, "decision_ready", JSON.stringify(result, null, 2));

    const allowedMutation = {
      ...result,
      dry_run: { ...result.dry_run, mutation_executed: true },
    };
    assert.equal(validateEvolutionGuardDecision(allowedMutation).ok, false);
    assert.ok(validateEvolutionGuardDecision(allowedMutation).issues.some((entry) => entry.code === "mutation_execution_forbidden"));

    const githubTransport = {
      ...result,
      guardrails: { ...result.guardrails, github_transport_authorized: true },
    };
    assert.equal(validateEvolutionGuardDecision(githubTransport).ok, false);
    assert.ok(validateEvolutionGuardDecision(githubTransport).issues.some((entry) => entry.code === "github_transport_forbidden"));

    const staleDigest = {
      ...result,
      guard_digest: "sha-fnv1a-00000000",
    };
    assert.equal(validateEvolutionGuardDecision(staleDigest).ok, false);
    assert.ok(validateEvolutionGuardDecision(staleDigest).issues.some((entry) => entry.code === "guard_digest_mismatch"));

    const staleId = {
      ...result,
      guard_id: "evolution-guard-00000000",
      guard_record: { ...result.guard_record, guard_id: "evolution-guard-00000000" },
    };
    assert.equal(validateEvolutionGuardDecision(staleId).ok, false);
    assert.ok(validateEvolutionGuardDecision(staleId).issues.some((entry) => entry.code === "guard_id_mismatch"));

    const acceptWithMissingRoute = {
      ...result,
      quorum: { ...result.quorum, missing_route_ids: [result.routing_ref.route_ids[0]] },
    };
    assert.equal(validateEvolutionGuardDecision(acceptWithMissingRoute).ok, false);
    assert.ok(validateEvolutionGuardDecision(acceptWithMissingRoute).issues.some((entry) => entry.code === "accepted_with_missing_reviews"));

    const unknownRoute = {
      ...result,
      reviews: [{ ...result.reviews[0], route_id: "audit-route-11111111" }, ...result.reviews.slice(1)],
    };
    assert.equal(validateEvolutionGuardDecision(unknownRoute).ok, false);
    assert.ok(validateEvolutionGuardDecision(unknownRoute).issues.some((entry) => entry.code === "unknown_review_route"));
  });

  it("supports stable aliases", () => {
    for (const fn of [evaluateEvolutionGuard, createEvolutionGuardDecision, runT050EvolutionGuard]) {
      const result = fn(input());
      assert.equal(result.decision, "evolution_guard_accept");
      assert.deepEqual(validateT050EvolutionGuardDecision(result), { ok: true, issues: [] });
    }
  });
});
