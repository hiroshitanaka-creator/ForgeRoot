import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXECUTION_ARTIFACT_RECEIPT_CONTRACT,
  createExecutionArtifactReceipt,
  createNVersionAuditRouting,
  runApprovalReceiptVerifier,
  runEvolutionGuard,
  runExecutionArtifactReceipt,
  runMutationPrGenerator,
  runMutationPrTransport,
  runT056ExecutionArtifactReceipt,
  runTransportExecutionPlan,
  runTransportReadinessLedger,
  summarizeTransportExecutionArtifact,
  validateExecutionArtifactReceipt,
  validateExecutionArtifactReceiptResult,
  validateT056ExecutionArtifactReceipt,
} from "../dist/index.js";

const NOW = "2026-07-05T00:00:00Z";

function readyPlan() {
  const proposal = {
    proposal_id: "speciation-proposal-11111111",
    mutation_id: "mut-22222222",
    mutation_class: "speciation",
    risk: "high",
    approval_class: "C",
    target_paths: [".forge/agents/planner.alpha.forge", ".forge/agents/planner.scoper.forge"],
    source_digest: "sha-fnv1a-abcdef12",
  };
  const reviewer = (overrides = {}) => ({ reviewer_id: "architecture-reviewer", independence_key: "org-architecture", focuses: ["architecture", "lineage"], max_parallel_assignments: 1, ...overrides });
  const routing = createNVersionAuditRouting({
    now: NOW,
    proposal,
    reviewers: [
      reviewer({ reviewer_id: "state-reviewer", independence_key: "org-state", focuses: ["state", "tests"] }),
      reviewer(),
      reviewer({ reviewer_id: "security-reviewer", independence_key: "org-security", focuses: ["security"] }),
      reviewer({ reviewer_id: "lineage-reviewer", independence_key: "org-lineage", focuses: ["lineage"] }),
    ],
    policy: { min_reviewers: 3, required_quorum: 2, required_focuses: ["architecture", "security", "lineage"] },
  });
  const reviews = routing.reviewer_routes.map((route, index) => ({
    route_id: route.route_id,
    reviewer_id: route.reviewer_id,
    independence_key: route.independence_key,
    decision: "approve",
    completed_at: NOW,
    routing_digest: routing.routing_digest,
    reviewed_target_paths: routing.proposal.target_paths,
    findings: [],
    evidence_digest: `sha-fnv1a-a560000${index}`,
  }));
  const guard = runEvolutionGuard({ now: NOW, proposal: routing.proposal, routing, reviews });
  const prPlan = runMutationPrGenerator({ now: NOW, guard, repository: "hiroshitanaka-creator/ForgeRoot", labels: ["t056"], reviewers: ["@maintainer-one"] });
  const request = runMutationPrTransport({ now: NOW, plan: prPlan, installation_id: 12345 });
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
  return runTransportExecutionPlan({ now: NOW, approval, request });
}

describe("T056 execution artifact receipt", () => {
  it("declares a deterministic receipt-only artifact contract", () => {
    assert.equal(EXECUTION_ARTIFACT_RECEIPT_CONTRACT.deterministic, true);
    assert.equal(EXECUTION_ARTIFACT_RECEIPT_CONTRACT.receiptOnly, true);
    assert.equal(EXECUTION_ARTIFACT_RECEIPT_CONTRACT.dryRunOnly, true);
    assert.ok(EXECUTION_ARTIFACT_RECEIPT_CONTRACT.consumes.includes("dry_run_transport_execution_plan_manifest"));
    assert.ok(EXECUTION_ARTIFACT_RECEIPT_CONTRACT.validates.includes("unexecuted_step_summary"));
    assert.ok(EXECUTION_ARTIFACT_RECEIPT_CONTRACT.forbids.includes("file_write"));
    assert.ok(EXECUTION_ARTIFACT_RECEIPT_CONTRACT.forbids.includes("artifact_persistence"));
  });

  it("creates a deterministic artifact receipt from a ready T055 plan", () => {
    const plan = readyPlan();
    assert.equal(plan.status, "execution_plan_ready", JSON.stringify(plan, null, 2));

    const result = runExecutionArtifactReceipt({ now: NOW, plan, artifact_label: "t056:transport-summary" });

    assert.equal(result.status, "artifact_receipt_ready", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "execution_artifact_receipt_ready");
    assert.equal(result.plan_ref.execution_plan_id, plan.execution_plan_id);
    assert.equal(result.plan_ref.request_id, plan.request_ref.request_id);
    assert.equal(result.artifact.label, "t056:transport-summary");
    assert.equal(result.artifact.kind, "dry_run_transport_execution_summary");
    assert.equal(result.artifact.step_count, plan.steps.length);
    assert.equal(result.artifact.action_counts.create_pull_request, 1);
    assert.equal(result.artifact.write_target, null);
    assert.equal(result.guards.no_file_write, true);
    assert.equal(result.guards.no_artifact_persistence, true);
    assert.equal(result.dry_run.file_written, false);
    assert.equal(result.dry_run.artifact_persisted, false);
    assert.deepEqual(validateExecutionArtifactReceiptResult(result), { ok: true, issues: [] });
    assert.deepEqual(validateExecutionArtifactReceipt(result), { ok: true, issues: [] });

    const replay = runExecutionArtifactReceipt({ now: NOW, plan, artifact_label: "t056:transport-summary" });
    assert.equal(replay.receipt_id, result.receipt_id);
    assert.equal(replay.receipt_digest, result.receipt_digest);
  });

  it("blocks non-ready T055 plans and invalidates malformed labels or tampered plans", () => {
    const plan = readyPlan();
    const blockedPlan = { ...plan, status: "blocked", decision: "execution_plan_blocked", reasons: ["execution_plan_blocked"], steps: plan.steps.map((entry) => ({ ...entry, status: "blocked" })) };
    const blocked = runExecutionArtifactReceipt({ now: NOW, plan: blockedPlan });
    assert.equal(blocked.status, "invalid");
    assert.ok(blocked.reasons.includes("invalid_t055_execution_plan"));

    const badLabel = runExecutionArtifactReceipt({ now: NOW, plan, artifact_label: "bad label with spaces" });
    assert.equal(badLabel.status, "invalid");
    assert.ok(badLabel.reasons.includes("invalid_artifact_label"));
    assert.equal(badLabel.artifact.label, "t056-artifact");
    assert.deepEqual(validateExecutionArtifactReceiptResult(badLabel), { ok: true, issues: [] });

    const secretLabel = runExecutionArtifactReceipt({ now: NOW, plan, artifact_label: "github_pat_abc123" });
    assert.equal(secretLabel.status, "invalid");
    assert.ok(secretLabel.reasons.includes("secret_material_forbidden"));
    assert.equal(secretLabel.artifact.label, "t056-artifact");
    assert.equal(JSON.stringify(secretLabel).includes("github_pat_abc123"), false);
    assert.deepEqual(validateExecutionArtifactReceiptResult(secretLabel), { ok: true, issues: [] });

    const stalePlan = runExecutionArtifactReceipt({ now: NOW, plan: { ...plan, execution_plan_digest: "sha-fnv1a-00000000" } });
    assert.equal(stalePlan.status, "invalid");
    assert.ok(stalePlan.reasons.includes("invalid_t055_execution_plan"));
  });

  it("rejects tampered receipts, write targets, side effects, guard weakening, and stale digests", () => {
    const result = runExecutionArtifactReceipt({ now: NOW, plan: readyPlan() });
    assert.equal(result.status, "artifact_receipt_ready", JSON.stringify(result, null, 2));

    const writeTarget = { ...result, artifact: { ...result.artifact, write_target: "docs/out.json" } };
    assert.equal(validateExecutionArtifactReceiptResult(writeTarget).ok, false);
    assert.ok(validateExecutionArtifactReceiptResult(writeTarget).issues.some((entry) => entry.code === "write_target_forbidden"));

    const sideEffect = { ...result, dry_run: { ...result.dry_run, file_written: true } };
    assert.equal(validateExecutionArtifactReceiptResult(sideEffect).ok, false);
    assert.ok(validateExecutionArtifactReceiptResult(sideEffect).issues.some((entry) => entry.code === "side_effect_forbidden"));

    const weakGuard = { ...result, guards: { ...result.guards, no_file_write: false } };
    assert.equal(validateExecutionArtifactReceiptResult(weakGuard).ok, false);
    assert.ok(validateExecutionArtifactReceiptResult(weakGuard).issues.some((entry) => entry.path === "guards.no_file_write"));

    const staleDigest = { ...result, receipt_digest: "sha-fnv1a-00000000" };
    assert.equal(validateExecutionArtifactReceiptResult(staleDigest).ok, false);
    assert.ok(validateExecutionArtifactReceiptResult(staleDigest).issues.some((entry) => entry.code === "receipt_digest_mismatch"));

    const secretArtifact = { ...result, artifact: { ...result.artifact, label: "github_pat_abc123" } };
    assert.equal(validateExecutionArtifactReceiptResult(secretArtifact).ok, false);
    assert.ok(validateExecutionArtifactReceiptResult(secretArtifact).issues.some((entry) => entry.code === "secret_material_forbidden"));

    const readyWithBlockedPlanRef = { ...result, plan_ref: { ...result.plan_ref, execution_plan_status: "blocked" } };
    assert.equal(validateExecutionArtifactReceiptResult(readyWithBlockedPlanRef).ok, false);
    assert.ok(validateExecutionArtifactReceiptResult(readyWithBlockedPlanRef).issues.some((entry) => entry.code === "ready_plan_status_required"));

    const inconsistentCounts = { ...result, artifact: { ...result.artifact, action_counts: { create_pull_request: 1 } } };
    assert.equal(validateExecutionArtifactReceiptResult(inconsistentCounts).ok, false);
    assert.ok(validateExecutionArtifactReceiptResult(inconsistentCounts).issues.some((entry) => entry.code === "action_counts_mismatch"));

    const emptyReadyArtifact = { ...result, artifact: { ...result.artifact, step_count: 0, action_counts: {} } };
    assert.equal(validateExecutionArtifactReceiptResult(emptyReadyArtifact).ok, false);
    assert.ok(validateExecutionArtifactReceiptResult(emptyReadyArtifact).issues.some((entry) => entry.code === "ready_steps_required"));
  });

  it("supports stable aliases", () => {
    const plan = readyPlan();
    for (const fn of [createExecutionArtifactReceipt, summarizeTransportExecutionArtifact, runT056ExecutionArtifactReceipt]) {
      const result = fn({ now: NOW, plan });
      assert.equal(result.status, "artifact_receipt_ready");
      assert.deepEqual(validateT056ExecutionArtifactReceipt(result), { ok: true, issues: [] });
    }
  });
});
