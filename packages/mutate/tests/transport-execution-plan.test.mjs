import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TRANSPORT_EXECUTION_PLAN_CONTRACT,
  createNVersionAuditRouting,
  createTransportExecutionPlan,
  planApprovedTransportExecution,
  runApprovalReceiptVerifier,
  runEvolutionGuard,
  runMutationPrGenerator,
  runMutationPrTransport,
  runT055TransportExecutionPlan,
  runTransportExecutionPlan,
  runTransportReadinessLedger,
  validateT055TransportExecutionPlan,
  validateTransportExecutionPlan,
  validateTransportExecutionPlanResult,
} from "../dist/index.js";

const NOW = "2026-07-05T00:00:00Z";

function proposal() {
  return {
    proposal_id: "speciation-proposal-11111111",
    mutation_id: "mut-22222222",
    mutation_class: "speciation",
    risk: "high",
    approval_class: "C",
    target_paths: [".forge/agents/planner.alpha.forge", ".forge/agents/planner.scoper.forge"],
    source_digest: "sha-fnv1a-abcdef12",
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

function reviewFor(route, routingResult, index = 0) {
  return {
    route_id: route.route_id,
    reviewer_id: route.reviewer_id,
    independence_key: route.independence_key,
    decision: "approve",
    completed_at: NOW,
    routing_digest: routingResult.routing_digest,
    reviewed_target_paths: routingResult.proposal.target_paths,
    findings: [],
    evidence_digest: `sha-fnv1a-eed0000${index}`,
  };
}

function approvedBundle() {
  const routingResult = routing();
  const guard = runEvolutionGuard({
    now: NOW,
    proposal: routingResult.proposal,
    routing: routingResult,
    reviews: routingResult.reviewer_routes.map((route, index) => reviewFor(route, routingResult, index)),
  });
  const plan = runMutationPrGenerator({
    now: NOW,
    guard,
    repository: "hiroshitanaka-creator/ForgeRoot",
    labels: ["t055"],
    reviewers: ["@maintainer-one"],
  });
  const request = runMutationPrTransport({ now: NOW, plan, installation_id: 12345 });
  const ledger = runTransportReadinessLedger({ now: NOW, request });
  const receipt = {
    receipt_id: "approval-receipt-aaaaaaaa",
    approver: "maintainer-one",
    approved_at: NOW,
    decision: "approve",
    statement: "I approve this readiness ledger for dry-run execution planning only.",
    evidence_digest: "sha-fnv1a-feed0001",
    scope: {
      ledger_id: ledger.ledger_id,
      ledger_digest: ledger.ledger_digest,
      request_id: ledger.request_ref.request_id,
      request_digest: ledger.request_ref.request_digest,
      plan_id: ledger.request_ref.plan_id,
    },
  };
  const approval = runApprovalReceiptVerifier({ now: NOW, ledger, receipts: [receipt] });
  return { request, approval };
}

describe("T055 transport execution plan", () => {
  it("declares a deterministic dry-run execution-plan-only contract", () => {
    assert.equal(TRANSPORT_EXECUTION_PLAN_CONTRACT.deterministic, true);
    assert.equal(TRANSPORT_EXECUTION_PLAN_CONTRACT.executionPlanOnly, true);
    assert.equal(TRANSPORT_EXECUTION_PLAN_CONTRACT.dryRunOnly, true);
    assert.ok(TRANSPORT_EXECUTION_PLAN_CONTRACT.consumes.includes("human_approval_receipt_verification_manifest"));
    assert.ok(TRANSPORT_EXECUTION_PLAN_CONTRACT.validates.includes("approval_request_scope_match"));
    assert.ok(TRANSPORT_EXECUTION_PLAN_CONTRACT.forbids.includes("token_request"));
    assert.ok(TRANSPORT_EXECUTION_PLAN_CONTRACT.forbids.includes("github_api_call"));
  });

  it("creates deterministic unexecuted transport steps from approved T054 and ready T052 manifests", () => {
    const { approval, request } = approvedBundle();
    assert.equal(approval.status, "approved", JSON.stringify(approval, null, 2));
    assert.equal(request.status, "transport_request_ready", JSON.stringify(request, null, 2));

    const result = runTransportExecutionPlan({ now: NOW, approval, request });

    assert.equal(result.status, "execution_plan_ready", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "dry_run_execution_plan_ready");
    assert.equal(result.approval_ref.verifier_id, approval.verifier_id);
    assert.equal(result.request_ref.request_id, request.request_id);
    assert.deepEqual(result.steps.map((entry) => entry.action), ["validate_approval", "create_pull_request", "add_labels", "request_reviewers"]);
    assert.ok(result.steps.every((entry) => entry.status === "planned_not_executed"));
    assert.ok(result.steps.every((entry) => entry.executed === false));
    assert.ok(result.steps.every((entry) => entry.requires_future_live_approval === true));
    assert.equal(result.runtime_gate.live_transport_authorized, false);
    assert.equal(result.guards.no_token_request, true);
    assert.equal(result.guards.no_github_api_call, true);
    assert.equal(result.dry_run.github_api_called, false);
    assert.equal(result.dry_run.token_requested, false);
    assert.deepEqual(validateTransportExecutionPlanResult(result), { ok: true, issues: [] });
    assert.deepEqual(validateTransportExecutionPlan(result), { ok: true, issues: [] });

    const replay = runTransportExecutionPlan({ now: NOW, approval, request });
    assert.equal(replay.execution_plan_id, result.execution_plan_id);
    assert.equal(replay.execution_plan_digest, result.execution_plan_digest);
    assert.deepEqual(replay.steps, result.steps);
  });

  it("blocks unapproved or non-ready inputs without executing any step", () => {
    const { approval, request } = approvedBundle();
    const blockedApproval = { ...approval, status: "blocked", decision: "human_approval_blocked", reasons: ["human_approval_blocked"], approval_summary: { ...approval.approval_summary, missing_approvals: 1 } };
    const approvalBlocked = runTransportExecutionPlan({ now: NOW, approval: blockedApproval, request });
    assert.equal(approvalBlocked.status, "invalid");
    assert.ok(approvalBlocked.reasons.includes("invalid_t054_approval_verification"));

    const blockedRequest = { ...request, status: "blocked", decision: "transport_blocked_by_pr_manifest", reasons: ["t051_manifest_not_ready"], repository: null, primary_request: undefined, post_create_requests: undefined, request_digest: "sha-fnv1a-00000000" };
    const requestBlocked = runTransportExecutionPlan({ now: NOW, approval, request: blockedRequest });
    assert.equal(requestBlocked.status, "invalid");
    assert.ok(requestBlocked.reasons.includes("invalid_t052_transport_request"));
  });

  it("invalidates approval/request scope mismatches and tampered inputs", () => {
    const { approval, request } = approvedBundle();

    const mismatch = runTransportExecutionPlan({ now: NOW, approval, request: { ...request, request_id: "mutation-pr-transport-00000000" } });
    assert.equal(mismatch.status, "invalid");
    assert.ok(mismatch.reasons.includes("invalid_t052_transport_request") || mismatch.reasons.includes("request_id_mismatch"));

    const staleApproval = runTransportExecutionPlan({ now: NOW, approval: { ...approval, approval_digest: "sha-fnv1a-00000000" }, request });
    assert.equal(staleApproval.status, "invalid");
    assert.ok(staleApproval.reasons.includes("invalid_t054_approval_verification"));
  });

  it("rejects executed steps, live authorization, guard weakening, merge paths, and stale digests", () => {
    const { approval, request } = approvedBundle();
    const result = runTransportExecutionPlan({ now: NOW, approval, request });
    assert.equal(result.status, "execution_plan_ready", JSON.stringify(result, null, 2));

    const executed = { ...result, steps: [{ ...result.steps[0], executed: true }] };
    assert.equal(validateTransportExecutionPlanResult(executed).ok, false);
    assert.ok(validateTransportExecutionPlanResult(executed).issues.some((entry) => entry.code === "step_execution_forbidden"));

    const liveGate = { ...result, runtime_gate: { ...result.runtime_gate, live_transport_authorized: true } };
    assert.equal(validateTransportExecutionPlanResult(liveGate).ok, false);
    assert.ok(validateTransportExecutionPlanResult(liveGate).issues.some((entry) => entry.code === "dry_run_only_required"));

    const weakGuard = { ...result, guards: { ...result.guards, no_token_request: false } };
    assert.equal(validateTransportExecutionPlanResult(weakGuard).ok, false);
    assert.ok(validateTransportExecutionPlanResult(weakGuard).issues.some((entry) => entry.path === "guards.no_token_request"));

    const mergePath = { ...result, steps: [{ ...result.steps[1], path: "/repos/hiroshitanaka-creator/ForgeRoot/pulls/1/merge" }] };
    assert.equal(validateTransportExecutionPlanResult(mergePath).ok, false);
    assert.ok(validateTransportExecutionPlanResult(mergePath).issues.some((entry) => entry.code === "unsafe_step_path"));

    const staleDigest = { ...result, execution_plan_digest: "sha-fnv1a-00000000" };
    assert.equal(validateTransportExecutionPlanResult(staleDigest).ok, false);
    assert.ok(validateTransportExecutionPlanResult(staleDigest).issues.some((entry) => entry.code === "execution_plan_digest_mismatch"));
  });

  it("supports stable aliases", () => {
    const { approval, request } = approvedBundle();
    for (const fn of [createTransportExecutionPlan, planApprovedTransportExecution, runT055TransportExecutionPlan]) {
      const result = fn({ now: NOW, approval, request });
      assert.equal(result.status, "execution_plan_ready");
      assert.deepEqual(validateT055TransportExecutionPlan(result), { ok: true, issues: [] });
    }
  });
});
