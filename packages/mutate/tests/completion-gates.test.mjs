import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LINEAGE_HANDOFF_PACK_CONTRACT,
  POST_TRANSPORT_AUDIT_PLAN_CONTRACT,
  ROLLOUT_GATE_CHECKLIST_CONTRACT,
  createLineageHandoffPack,
  createNVersionAuditRouting,
  createPostTransportAuditPlan,
  createRolloutGateChecklist,
  runApprovalReceiptVerifier,
  runEvolutionGuard,
  runExecutionArtifactReceipt,
  runLineageHandoffPack,
  runMutationPrGenerator,
  runMutationPrTransport,
  runPostTransportAuditPlan,
  runRolloutGateChecklist,
  runT057RolloutGateChecklist,
  runT058PostTransportAuditPlan,
  runT059LineageHandoffPack,
  runTransportExecutionPlan,
  runTransportReadinessLedger,
  validateLineageHandoffPackResult,
  validatePostTransportAuditPlanResult,
  validateRolloutGateChecklistResult,
  validateT057RolloutGateChecklist,
  validateT058PostTransportAuditPlan,
  validateT059LineageHandoffPack,
} from "../dist/index.js";

const NOW = "2026-07-05T00:00:00Z";

function receiptReady() {
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
    evidence_digest: `sha-fnv1a-f570000${index}`,
  }));
  const guard = runEvolutionGuard({ now: NOW, proposal: routing.proposal, routing, reviews });
  const prPlan = runMutationPrGenerator({ now: NOW, guard, repository: "hiroshitanaka-creator/ForgeRoot", labels: ["t057"], reviewers: ["@maintainer-one"] });
  const request = runMutationPrTransport({ now: NOW, plan: prPlan, installation_id: 12345 });
  const readiness = runTransportReadinessLedger({ now: NOW, request });
  const approvalReceipt = {
    receipt_id: "approval-receipt-aaaaaaaa",
    approver: "maintainer-one",
    approved_at: NOW,
    decision: "approve",
    statement: "I approve this readiness ledger for dry-run execution planning only.",
    evidence_digest: "sha-fnv1a-feed0001",
    scope: {
      ledger_id: readiness.ledger_id,
      ledger_digest: readiness.ledger_digest,
      request_id: readiness.request_ref.request_id,
      request_digest: readiness.request_ref.request_digest,
      plan_id: readiness.request_ref.plan_id,
    },
  };
  const approval = runApprovalReceiptVerifier({ now: NOW, ledger: readiness, receipts: [approvalReceipt] });
  const execution = runTransportExecutionPlan({ now: NOW, approval, request });
  return runExecutionArtifactReceipt({ now: NOW, plan: execution });
}

describe("T057-T059 completion gates", () => {
  it("declares deterministic dry-run contracts", () => {
    for (const contract of [ROLLOUT_GATE_CHECKLIST_CONTRACT, POST_TRANSPORT_AUDIT_PLAN_CONTRACT, LINEAGE_HANDOFF_PACK_CONTRACT]) {
      assert.equal(contract.deterministic, true);
      assert.equal(contract.dryRunOnly, true);
      assert.ok(contract.forbids.includes("file_write"));
      assert.ok(contract.forbids.includes("github_api_call"));
      assert.ok(contract.forbids.includes("mutation_execution"));
    }
  });

  it("creates the ready T057 rollout checklist, T058 audit plan, and T059 handoff pack", () => {
    const receipt = receiptReady();
    const checklist = runRolloutGateChecklist({ now: NOW, receipt });
    assert.equal(checklist.status, "rollout_gate_ready", JSON.stringify(checklist, null, 2));
    assert.equal(checklist.summary.fail_count, 0);
    assert.equal(checklist.summary.pending_count, 0);
    assert.ok(checklist.checks.some((entry) => entry.gate_id === "artifact-receipt-ready"));
    assert.deepEqual(validateRolloutGateChecklistResult(checklist), { ok: true, issues: [] });

    const auditPlan = runPostTransportAuditPlan({ now: NOW, checklist });
    assert.equal(auditPlan.status, "audit_plan_ready", JSON.stringify(auditPlan, null, 2));
    assert.equal(auditPlan.audit_steps.length, 4);
    assert.ok(auditPlan.audit_steps.every((entry) => entry.executed === false));
    assert.deepEqual(validatePostTransportAuditPlanResult(auditPlan), { ok: true, issues: [] });

    const handoff = runLineageHandoffPack({ now: NOW, audit_plan: auditPlan });
    assert.equal(handoff.status, "handoff_pack_ready", JSON.stringify(handoff, null, 2));
    assert.equal(handoff.handoff_entries.length, 4);
    assert.ok(handoff.handoff_entries.every((entry) => entry.persisted === false));
    assert.deepEqual(validateLineageHandoffPackResult(handoff), { ok: true, issues: [] });
  });

  it("blocks failed gates and propagates blocked status without side effects", () => {
    const receipt = receiptReady();
    const checklist = runRolloutGateChecklist({
      now: NOW,
      receipt,
      checks: [{ gate_id: "manual-rollout-window", status: "fail", summary: "window closed" }],
    });
    assert.equal(checklist.status, "blocked", JSON.stringify(checklist, null, 2));
    assert.equal(checklist.summary.fail_count, 1);
    assert.deepEqual(validateRolloutGateChecklistResult(checklist), { ok: true, issues: [] });

    const auditPlan = runPostTransportAuditPlan({ now: NOW, checklist });
    assert.equal(auditPlan.status, "blocked");
    assert.ok(auditPlan.audit_steps.every((entry) => entry.status === "blocked" && entry.executed === false));

    const handoff = runLineageHandoffPack({ now: NOW, audit_plan: auditPlan });
    assert.equal(handoff.status, "blocked");
    assert.ok(handoff.handoff_entries.every((entry) => entry.persisted === false));
  });

  it("invalidates tampered upstream manifests and read-back tampering", () => {
    const receipt = receiptReady();
    const staleReceipt = runRolloutGateChecklist({ now: NOW, receipt: { ...receipt, receipt_digest: "sha-fnv1a-00000000" } });
    assert.equal(staleReceipt.status, "invalid");
    assert.ok(staleReceipt.reasons.includes("invalid_t056_artifact_receipt"));

    const checklist = runRolloutGateChecklist({ now: NOW, receipt });
    const staleChecklist = runPostTransportAuditPlan({ now: NOW, checklist: { ...checklist, checklist_digest: "sha-fnv1a-00000000" } });
    assert.equal(staleChecklist.status, "invalid");
    assert.ok(staleChecklist.reasons.includes("invalid_t057_rollout_gate"));

    const auditPlan = runPostTransportAuditPlan({ now: NOW, checklist });
    const staleAudit = runLineageHandoffPack({ now: NOW, audit_plan: { ...auditPlan, audit_plan_digest: "sha-fnv1a-00000000" } });
    assert.equal(staleAudit.status, "invalid");
    assert.ok(staleAudit.reasons.includes("invalid_t058_audit_plan"));

    const persistedHandoff = { ...runLineageHandoffPack({ now: NOW, audit_plan: auditPlan }), handoff_entries: [{ ...runLineageHandoffPack({ now: NOW, audit_plan: auditPlan }).handoff_entries[0], persisted: true }] };
    assert.equal(validateLineageHandoffPackResult(persistedHandoff).ok, false);
    assert.ok(validateLineageHandoffPackResult(persistedHandoff).issues.some((entry) => entry.code === "handoff_persistence_forbidden"));
  });

  it("supports stable aliases", () => {
    const receipt = receiptReady();
    for (const fn of [createRolloutGateChecklist, runT057RolloutGateChecklist]) {
      const checklist = fn({ now: NOW, receipt });
      assert.equal(checklist.status, "rollout_gate_ready");
      assert.deepEqual(validateT057RolloutGateChecklist(checklist), { ok: true, issues: [] });
    }
    const checklist = runRolloutGateChecklist({ now: NOW, receipt });
    for (const fn of [createPostTransportAuditPlan, runT058PostTransportAuditPlan]) {
      const auditPlan = fn({ now: NOW, checklist });
      assert.equal(auditPlan.status, "audit_plan_ready");
      assert.deepEqual(validateT058PostTransportAuditPlan(auditPlan), { ok: true, issues: [] });
    }
    const auditPlan = runPostTransportAuditPlan({ now: NOW, checklist });
    for (const fn of [createLineageHandoffPack, runT059LineageHandoffPack]) {
      const handoff = fn({ now: NOW, audit_plan: auditPlan });
      assert.equal(handoff.status, "handoff_pack_ready");
      assert.deepEqual(validateT059LineageHandoffPack(handoff), { ok: true, issues: [] });
    }
  });
});
