import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MUTATION_PR_TRANSPORT_CONTRACT,
  createMutationPrTransportRequest,
  createNVersionAuditRouting,
  prepareMutationPrTransportRequest,
  runEvolutionGuard,
  runMutationPrGenerator,
  runMutationPrTransport,
  runT052MutationPrTransport,
  validateMutationPrTransportRequest,
  validateMutationPrTransportResult,
  validateT052MutationPrTransport,
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

function routing() {
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
    evidence_digest: `sha-fnv1a-cab0000${index}`,
    ...overrides,
  };
}

function acceptedGuard(overrides = {}) {
  const routingResult = routing();
  return runEvolutionGuard({
    now: NOW,
    proposal: routingResult.proposal,
    routing: routingResult,
    reviews: routingResult.reviewer_routes.map((route, index) => reviewFor(route, routingResult, index)),
    ...overrides,
  });
}

function readyPlan(overrides = {}) {
  return runMutationPrGenerator({
    now: NOW,
    guard: acceptedGuard(),
    repository: "hiroshitanaka-creator/ForgeRoot",
    labels: ["t052"],
    reviewers: ["@maintainer-one"],
    ...overrides,
  });
}

describe("T052 mutation PR transport", () => {
  it("declares a deterministic dry-run-only GitHub transport request contract", () => {
    assert.equal(MUTATION_PR_TRANSPORT_CONTRACT.deterministic, true);
    assert.equal(MUTATION_PR_TRANSPORT_CONTRACT.dryRunOnly, true);
    assert.equal(MUTATION_PR_TRANSPORT_CONTRACT.transportPlanOnly, true);
    assert.ok(MUTATION_PR_TRANSPORT_CONTRACT.consumes.includes("mutation_pull_request_plan_manifest"));
    assert.ok(MUTATION_PR_TRANSPORT_CONTRACT.produces.includes("dry_run_mutation_pr_transport_request_manifest"));
    assert.ok(MUTATION_PR_TRANSPORT_CONTRACT.forbids.includes("live_github_transport"));
    assert.ok(MUTATION_PR_TRANSPORT_CONTRACT.forbids.includes("token_request"));
    assert.ok(MUTATION_PR_TRANSPORT_CONTRACT.forbids.includes("merge_operation"));
  });

  it("creates a deterministic dry-run PR transport request from a ready T051 manifest", () => {
    const plan = readyPlan();
    assert.equal(plan.status, "pr_manifest_ready", JSON.stringify(plan, null, 2));

    const result = runMutationPrTransport({ now: NOW, plan, installation_id: 12345 });

    assert.equal(result.status, "transport_request_ready", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "dry_run_transport_request_ready");
    assert.equal(result.dry_run, true);
    assert.deepEqual(result.repository, {
      owner: "hiroshitanaka-creator",
      repo: "ForgeRoot",
      full_name: "hiroshitanaka-creator/ForgeRoot",
      installation_id: 12345,
    });
    assert.equal(result.primary_request.method, "POST");
    assert.equal(result.primary_request.path, "/repos/hiroshitanaka-creator/ForgeRoot/pulls");
    assert.equal(result.primary_request.body.title, plan.pull_request.title);
    assert.equal(result.primary_request.body.body, plan.pull_request.body);
    assert.equal(result.primary_request.body.head, plan.pull_request.head);
    assert.equal(result.primary_request.body.base, "main");
    assert.equal(result.primary_request.body.draft, true);
    assert.equal(result.primary_request.body.maintainer_can_modify, false);
    assert.deepEqual(result.post_create_requests.map((entry) => entry.name), ["add_labels_to_pull_request_issue", "request_pull_request_reviewers"]);
    assert.equal(result.runtime_gate.live_transport_allowed, false);
    assert.equal(result.runtime_gate.dry_run_only, true);
    assert.equal(result.guards.no_token_request, true);
    assert.equal(result.guards.no_github_api_call, true);
    assert.equal(result.guards.no_git_push, true);
    assert.equal(result.guards.no_merge_operation, true);
    assert.deepEqual(validateMutationPrTransportResult(result), { ok: true, issues: [] });
    assert.deepEqual(validateMutationPrTransportRequest(result), { ok: true, issues: [] });

    const replay = runMutationPrTransport({ now: NOW, plan, installation_id: 12345 });
    assert.equal(replay.request_id, result.request_id);
    assert.equal(replay.request_digest, result.request_digest);
    assert.deepEqual(replay.primary_request, result.primary_request);
  });

  it("blocks T051 plans that are not ready without emitting transport requests", () => {
    const routingResult = routing();
    const holdGuard = runEvolutionGuard({
      now: NOW,
      proposal: routingResult.proposal,
      routing: routingResult,
      reviews: routingResult.reviewer_routes.slice(0, 2).map((route, index) => reviewFor(route, routingResult, index)),
    });
    const plan = runMutationPrGenerator({ now: NOW, guard: holdGuard });

    const result = runMutationPrTransport({ now: NOW, plan, repository: "hiroshitanaka-creator/ForgeRoot" });

    assert.equal(result.status, "blocked", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "transport_blocked_by_pr_manifest");
    assert.equal(result.primary_request, undefined);
    assert.equal(result.post_create_requests, undefined);
    assert.equal(result.repository, null);
    assert.ok(result.reasons.includes("t051_manifest_not_ready"));
    assert.deepEqual(validateMutationPrTransportResult(result), { ok: true, issues: [] });
  });

  it("invalidates tampered T051 manifests and unsafe transport inputs", () => {
    const plan = readyPlan();
    const stalePlan = runMutationPrTransport({ now: NOW, plan: { ...plan, plan_digest: "sha-fnv1a-00000000" } });
    assert.equal(stalePlan.status, "invalid");
    assert.ok(stalePlan.reasons.includes("invalid_t051_pr_manifest"));

    const liveTransport = runMutationPrTransport({ now: NOW, plan, dry_run: false });
    assert.equal(liveTransport.status, "invalid");
    assert.ok(liveTransport.reasons.includes("live_transport_forbidden"));

    const badRepository = runMutationPrTransport({ now: NOW, plan, repository: "not a repo" });
    assert.equal(badRepository.status, "invalid");
    assert.ok(badRepository.reasons.includes("invalid_repository"));

    const missingRepositoryPlan = { ...plan, repository: null };
    const missingRepository = runMutationPrTransport({ now: NOW, plan: missingRepositoryPlan });
    assert.equal(missingRepository.status, "invalid");
    assert.ok(missingRepository.reasons.includes("invalid_t051_pr_manifest"));
  });

  it("rejects tampered transport requests, secrets, live paths, and guard weakening", () => {
    const result = runMutationPrTransport({ now: NOW, plan: readyPlan() });
    assert.equal(result.status, "transport_request_ready", JSON.stringify(result, null, 2));

    const liveRequest = { ...result, dry_run: false };
    assert.equal(validateMutationPrTransportResult(liveRequest).ok, false);
    assert.ok(validateMutationPrTransportResult(liveRequest).issues.some((entry) => entry.code === "dry_run_required"));

    const mergeEndpoint = {
      ...result,
      primary_request: { ...result.primary_request, path: "/repos/hiroshitanaka-creator/ForgeRoot/pulls/1/merge" },
    };
    assert.equal(validateMutationPrTransportResult(mergeEndpoint).ok, false);
    assert.ok(validateMutationPrTransportResult(mergeEndpoint).issues.some((entry) => entry.code === "merge_endpoint_forbidden" || entry.code === "path_mismatch"));

    const mismatchedPostCreateName = {
      ...result,
      post_create_requests: [
        { ...result.post_create_requests[0], name: "request_pull_request_reviewers" },
        result.post_create_requests[1],
      ],
    };
    assert.equal(validateMutationPrTransportResult(mismatchedPostCreateName).ok, false);
    assert.ok(validateMutationPrTransportResult(mismatchedPostCreateName).issues.some((entry) => entry.code === "path_mismatch" || entry.code === "post_create_body_mismatch"));

    const labelRequestWithReviewerBody = {
      ...result,
      post_create_requests: [
        { ...result.post_create_requests[0], body: { reviewers: ["maintainer-one"], team_reviewers: [] } },
        result.post_create_requests[1],
      ],
    };
    assert.equal(validateMutationPrTransportResult(labelRequestWithReviewerBody).ok, false);
    assert.ok(validateMutationPrTransportResult(labelRequestWithReviewerBody).issues.some((entry) => entry.code === "invalid_labels_body" || entry.code === "post_create_body_mismatch"));

    const reviewerRequestWithLabelBody = {
      ...result,
      post_create_requests: [
        result.post_create_requests[0],
        { ...result.post_create_requests[1], body: { labels: ["t052"] } },
      ],
    };
    assert.equal(validateMutationPrTransportResult(reviewerRequestWithLabelBody).ok, false);
    assert.ok(validateMutationPrTransportResult(reviewerRequestWithLabelBody).issues.some((entry) => entry.code === "invalid_reviewers_body" || entry.code === "post_create_body_mismatch"));

    const defaultHead = {
      ...result,
      primary_request: { ...result.primary_request, body: { ...result.primary_request.body, head: "main" } },
    };
    assert.equal(validateMutationPrTransportResult(defaultHead).ok, false);
    assert.ok(validateMutationPrTransportResult(defaultHead).issues.some((entry) => entry.code === "unsafe_head_branch" || entry.code === "default_branch_write_forbidden"));

    const weakGuard = { ...result, guards: { ...result.guards, no_token_request: false } };
    assert.equal(validateMutationPrTransportResult(weakGuard).ok, false);
    assert.ok(validateMutationPrTransportResult(weakGuard).issues.some((entry) => entry.path === "guards.no_token_request"));

    const staleDigest = { ...result, request_digest: "sha-fnv1a-00000000" };
    assert.equal(validateMutationPrTransportResult(staleDigest).ok, false);
    assert.ok(validateMutationPrTransportResult(staleDigest).issues.some((entry) => entry.code === "request_digest_mismatch"));

    const secretBody = {
      ...result,
      primary_request: { ...result.primary_request, body: { ...result.primary_request.body, body: `${result.primary_request.body.body}\nBearer abc` } },
    };
    assert.equal(validateMutationPrTransportResult(secretBody).ok, false);
    assert.ok(validateMutationPrTransportResult(secretBody).issues.some((entry) => entry.code === "secret_material_forbidden"));

    const blockedWithRequest = {
      ...runMutationPrTransport({ now: NOW, plan: runMutationPrGenerator({ now: NOW, guard: acceptedGuard({ reviews: [] }) }) }),
      primary_request: result.primary_request,
    };
    assert.equal(validateMutationPrTransportResult(blockedWithRequest).ok, false);
    assert.ok(validateMutationPrTransportResult(blockedWithRequest).issues.some((entry) => entry.code === "terminal_primary_request_forbidden"));
  });

  it("supports stable aliases", () => {
    for (const fn of [createMutationPrTransportRequest, prepareMutationPrTransportRequest, runT052MutationPrTransport]) {
      const result = fn({ now: NOW, plan: readyPlan() });
      assert.equal(result.status, "transport_request_ready");
      assert.deepEqual(validateT052MutationPrTransport(result), { ok: true, issues: [] });
    }
  });
});
