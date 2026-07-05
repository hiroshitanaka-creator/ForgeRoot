import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  N_VERSION_AUDIT_ROUTING_CONTRACT,
  createNVersionAuditRouting,
  routeNVersionAudit,
  runNVersionAuditRouting,
  runT049NVersionAuditRouting,
  validateNVersionAuditRouting,
  validateT049NVersionAuditRouting,
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

function policy(overrides = {}) {
  return {
    min_reviewers: 3,
    required_quorum: 2,
    required_focuses: ["architecture", "security", "lineage"],
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    now: NOW,
    proposal: proposal(),
    reviewers: [
      reviewer({ reviewer_id: "state-reviewer", independence_key: "org-state", focuses: ["state", "tests"] }),
      reviewer(),
      reviewer({ reviewer_id: "security-reviewer", independence_key: "org-security", focuses: ["security"] }),
      reviewer({ reviewer_id: "lineage-reviewer", independence_key: "org-lineage", focuses: ["lineage"] }),
    ],
    policy: policy(),
    ...overrides,
  };
}

describe("T049 N-version audit routing", () => {
  it("declares a deterministic dry-run-only routing contract", () => {
    assert.equal(N_VERSION_AUDIT_ROUTING_CONTRACT.dryRunOnly, true);
    assert.equal(N_VERSION_AUDIT_ROUTING_CONTRACT.deterministic, true);
    assert.ok(N_VERSION_AUDIT_ROUTING_CONTRACT.validates.includes("independent_reviewer_quorum"));
    assert.ok(N_VERSION_AUDIT_ROUTING_CONTRACT.validates.includes("required_focus_coverage"));
    assert.ok(N_VERSION_AUDIT_ROUTING_CONTRACT.forbids.includes("reviewer_notification"));
    assert.ok(N_VERSION_AUDIT_ROUTING_CONTRACT.forbids.includes("evolution_guard_decision"));
  });

  it("creates a deterministic Class C N-version audit routing manifest", () => {
    const result = createNVersionAuditRouting(input());

    assert.equal(result.status, "routing_ready", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "n_version_audit_routing_ready");
    assert.equal(result.review_gate.approval_class, "C");
    assert.equal(result.review_gate.human_review_required_before_execution, true);
    assert.equal(result.quorum.required_quorum, 2);
    assert.equal(result.quorum.minimum_distinct_independence_keys, result.reviewer_routes.length);
    assert.deepEqual(result.reviewer_routes.map((route) => route.lane), ["n1", "n2", "n3"]);
    assert.deepEqual(result.reviewer_routes.map((route) => route.reviewer_id), ["architecture-reviewer", "lineage-reviewer", "security-reviewer"]);
    assert.deepEqual(result.reviewer_routes[0].assigned_target_paths, result.proposal.target_paths);
    assert.equal(result.dry_run.file_written, false);
    assert.equal(result.dry_run.reviewers_notified, false);
    assert.equal(result.dry_run.audit_jobs_started, false);
    assert.equal(result.dry_run.evolution_guard_decided, false);
    assert.deepEqual(validateNVersionAuditRouting(result), { ok: true, issues: [] });

    const replay = createNVersionAuditRouting(input());
    assert.equal(replay.routing_id, result.routing_id);
    assert.equal(replay.routing_digest, result.routing_digest);
    assert.deepEqual(replay.reviewer_routes, result.reviewer_routes);
  });

  it("excludes conflicted reviewer candidates without notifying them", () => {
    const result = createNVersionAuditRouting(input({
      reviewers: [
        reviewer({
          reviewer_id: "aaa-conflicted",
          independence_key: "org-conflicted",
          focuses: ["architecture"],
          conflict_paths: [".forge/agents/planner.alpha.forge/"],
        }),
        reviewer(),
        reviewer({ reviewer_id: "security-reviewer", independence_key: "org-security", focuses: ["security"] }),
        reviewer({ reviewer_id: "lineage-reviewer", independence_key: "org-lineage", focuses: ["lineage"] }),
      ],
    }));

    assert.equal(result.status, "routing_ready", JSON.stringify(result, null, 2));
    assert.ok(result.reasons.includes("conflicted_reviewers_excluded"));
    assert.equal(result.reviewer_routes.some((route) => route.reviewer_id === "aaa-conflicted"), false);
    assert.equal(result.dry_run.reviewers_notified, false);
    assert.deepEqual(validateNVersionAuditRouting(result), { ok: true, issues: [] });
  });

  it("rejects non-Class-C proposals, unsafe targets, malformed timestamps, and duplicate reviewers", () => {
    const cases = [
      { name: "medium risk", input: input({ proposal: proposal({ risk: "medium" }) }), reason: "high_risk_required" },
      { name: "approval class B", input: input({ proposal: proposal({ approval_class: "B" }) }), reason: "class_c_required" },
      { name: "unsupported mutation class", input: input({ proposal: proposal({ mutation_class: "workflow" }) }), reason: "unsupported_mutation_class" },
      { name: "forbidden target", input: input({ proposal: proposal({ target_paths: [".forge/policies/constitution.forge"] }) }), reason: "forbidden_document_path" },
      { name: "bad timestamp", input: input({ now: "2026-99-99T99:99:99Z" }), reason: "now_must_be_rfc3339_utc" },
      {
        name: "duplicate reviewer",
        input: input({
          reviewers: [
            reviewer(),
            reviewer({ independence_key: "org-other" }),
            reviewer({ reviewer_id: "security-reviewer", independence_key: "org-security", focuses: ["security"] }),
          ],
        }),
        reason: "duplicate_reviewer_id",
      },
    ];

    for (const { name, input: candidate, reason } of cases) {
      const result = createNVersionAuditRouting(candidate);
      assert.equal(result.status, "rejected", name);
      assert.ok(result.reasons.includes(reason), `${name} -> ${JSON.stringify(result.reasons)}`);
      assert.deepEqual(validateNVersionAuditRouting(result), { ok: true, issues: [] }, name);
    }
  });

  it("rejects insufficient independent reviewers, uncovered focus, and impossible quorum", () => {
    const cases = [
      {
        name: "only duplicate independence keys",
        input: input({
          reviewers: [
            reviewer(),
            reviewer({ reviewer_id: "security-reviewer", independence_key: "org-architecture", focuses: ["security"] }),
            reviewer({ reviewer_id: "lineage-reviewer", independence_key: "org-architecture", focuses: ["lineage"] }),
          ],
        }),
        reason: "insufficient_independent_reviewers",
      },
      {
        name: "conflicted reviewers remove quorum",
        input: input({
          reviewers: [
            reviewer({ conflict_paths: [".forge/agents/planner.alpha.forge"] }),
            reviewer({ reviewer_id: "security-reviewer", independence_key: "org-security", focuses: ["security"], conflict_paths: [".forge/agents/planner.scoper.forge"] }),
            reviewer({ reviewer_id: "lineage-reviewer", independence_key: "org-lineage", focuses: ["lineage"] }),
          ],
        }),
        reason: "reviewer_conflict_with_target",
      },
      {
        name: "uncovered tests focus",
        input: input({
          reviewers: [
            reviewer(),
            reviewer({ reviewer_id: "security-reviewer", independence_key: "org-security", focuses: ["security"] }),
            reviewer({ reviewer_id: "lineage-reviewer", independence_key: "org-lineage", focuses: ["lineage"] }),
          ],
          policy: policy({ required_focuses: ["architecture", "security", "tests"] }),
        }),
        reason: "required_focus_uncovered",
      },
      {
        name: "quorum too high",
        input: input({ policy: policy({ min_reviewers: 3, required_quorum: 4 }) }),
        reason: "required_quorum_exceeds_min_reviewers",
      },
    ];

    for (const { name, input: candidate, reason } of cases) {
      const result = createNVersionAuditRouting(candidate);
      assert.equal(result.status, "rejected", name);
      assert.ok(result.reasons.includes(reason), `${name} -> ${JSON.stringify(result.reasons)}`);
      assert.deepEqual(validateNVersionAuditRouting(result), { ok: true, issues: [] }, name);
    }
  });

  it("clones proposal, policy, and reviewer route metadata before returning", () => {
    const candidate = input();
    const result = createNVersionAuditRouting(candidate);

    candidate.proposal.target_paths.push(".forge/agents/mutated.alpha.forge");
    candidate.policy.required_focuses.push("tests");
    candidate.reviewers[1].focuses.push("tests");

    assert.deepEqual(result.proposal.target_paths, [".forge/agents/planner.alpha.forge", ".forge/agents/planner.scoper.forge"]);
    assert.deepEqual(result.policy.required_focuses, ["architecture", "security", "lineage"]);
    assert.deepEqual(result.reviewer_routes[0].focuses, ["architecture", "lineage"]);
  });

  it("rejects tampered gates, side effects, route independence, quorum, and digests", () => {
    const result = createNVersionAuditRouting(input());
    assert.equal(result.status, "routing_ready", JSON.stringify(result, null, 2));

    const withoutMergeGate = {
      ...result,
      review_gate: { ...result.review_gate, human_review_required_before_merge: false },
    };
    assert.equal(validateNVersionAuditRouting(withoutMergeGate).ok, false);
    assert.ok(validateNVersionAuditRouting(withoutMergeGate).issues.some((entry) => entry.code === "human_review_before_merge_required"));

    const withReviewerNotification = {
      ...result,
      dry_run: { ...result.dry_run, reviewers_notified: true },
    };
    assert.equal(validateNVersionAuditRouting(withReviewerNotification).ok, false);
    assert.ok(validateNVersionAuditRouting(withReviewerNotification).issues.some((entry) => entry.code === "reviewer_notification_forbidden"));

    const duplicateIndependence = {
      ...result,
      reviewer_routes: [
        result.reviewer_routes[0],
        { ...result.reviewer_routes[1], independence_key: result.reviewer_routes[0].independence_key },
        result.reviewer_routes[2],
      ],
    };
    const duplicateValidation = validateNVersionAuditRouting(duplicateIndependence);
    assert.equal(duplicateValidation.ok, false);
    assert.ok(duplicateValidation.issues.some((entry) => entry.code === "duplicate_independence_key"));

    const missingTarget = {
      ...result,
      reviewer_routes: [
        { ...result.reviewer_routes[0], assigned_target_paths: [result.proposal.target_paths[0]] },
        result.reviewer_routes[1],
        result.reviewer_routes[2],
      ],
    };
    const missingTargetValidation = validateNVersionAuditRouting(missingTarget);
    assert.equal(missingTargetValidation.ok, false);
    assert.ok(missingTargetValidation.issues.some((entry) => entry.code === "assigned_target_paths_mismatch"));
    assert.ok(missingTargetValidation.issues.some((entry) => entry.code === "route_id_mismatch"));

    const badQuorum = {
      ...result,
      quorum: { ...result.quorum, evolution_guard_handoff: "after_first_review" },
    };
    assert.equal(validateNVersionAuditRouting(badQuorum).ok, false);
    assert.ok(validateNVersionAuditRouting(badQuorum).issues.some((entry) => entry.code === "invalid_evolution_guard_handoff"));

    const staleDigest = {
      ...result,
      routing_digest: "sha-fnv1a-00000000",
    };
    assert.equal(validateNVersionAuditRouting(staleDigest).ok, false);
    assert.ok(validateNVersionAuditRouting(staleDigest).issues.some((entry) => entry.code === "routing_digest_mismatch"));

    const tamperedRoutingId = {
      ...result,
      routing_id: "audit-routing-00000000",
      routing_record: { ...result.routing_record, routing_id: "audit-routing-00000000" },
    };
    assert.equal(validateNVersionAuditRouting(tamperedRoutingId).ok, false);
    assert.ok(validateNVersionAuditRouting(tamperedRoutingId).issues.some((entry) => entry.code === "routing_id_mismatch"));

    const rejectedWithRoutes = {
      ...createNVersionAuditRouting(input({ proposal: proposal({ risk: "medium" }) })),
      reviewer_routes: result.reviewer_routes,
    };
    assert.equal(validateNVersionAuditRouting(rejectedWithRoutes).ok, false);
    assert.ok(validateNVersionAuditRouting(rejectedWithRoutes).issues.some((entry) => entry.code === "rejected_routes_forbidden"));

    const malformedRoute = {
      ...result,
      reviewer_routes: [null],
    };
    assert.doesNotThrow(() => validateNVersionAuditRouting(malformedRoute));
    assert.equal(validateNVersionAuditRouting(malformedRoute).ok, false);
    assert.ok(validateNVersionAuditRouting(malformedRoute).issues.some((entry) => entry.code === "object_required"));
  });

  it("supports stable aliases", () => {
    for (const fn of [routeNVersionAudit, runNVersionAuditRouting, runT049NVersionAuditRouting]) {
      const result = fn(input());
      assert.equal(result.status, "routing_ready");
      assert.deepEqual(validateT049NVersionAuditRouting(result), { ok: true, issues: [] });
    }
  });
});
