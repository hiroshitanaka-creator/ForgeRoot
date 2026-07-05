import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMPLETION_BUNDLE_CONTRACT,
  createCompletionBundle,
  createNVersionAuditRouting,
  runApprovalReceiptVerifier,
  runCompletionBundle,
  runEvolutionGuard,
  runExecutionArtifactReceipt,
  runLineageHandoffPack,
  runMutationPrGenerator,
  runMutationPrTransport,
  runPostTransportAuditPlan,
  runRolloutGateChecklist,
  runT060CompletionBundle,
  runTransportExecutionPlan,
  runTransportReadinessLedger,
  validateCompletionBundleResult,
  validateT060CompletionBundle,
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
  const prPlan = runMutationPrGenerator({ now: NOW, guard, repository: "hiroshitanaka-creator/ForgeRoot", labels: ["t060"], reviewers: ["@maintainer-one"] });
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

function handoffReady() {
  const receipt = receiptReady();
  const checklist = runRolloutGateChecklist({ now: NOW, receipt });
  const auditPlan = runPostTransportAuditPlan({ now: NOW, checklist });
  return runLineageHandoffPack({ now: NOW, audit_plan: auditPlan });
}

function handoffBlocked() {
  const receipt = receiptReady();
  const checklist = runRolloutGateChecklist({
    now: NOW,
    receipt,
    checks: [{ gate_id: "manual-rollout-window", status: "fail", summary: "window closed" }],
  });
  const auditPlan = runPostTransportAuditPlan({ now: NOW, checklist });
  return runLineageHandoffPack({ now: NOW, audit_plan: auditPlan });
}

describe("T060 completion bundle", () => {
  it("declares a deterministic dry-run-only contract", () => {
    assert.equal(COMPLETION_BUNDLE_CONTRACT.deterministic, true);
    assert.equal(COMPLETION_BUNDLE_CONTRACT.dryRunOnly, true);
    assert.ok(COMPLETION_BUNDLE_CONTRACT.forbids.includes("file_write"));
    assert.ok(COMPLETION_BUNDLE_CONTRACT.forbids.includes("artifact_persistence"));
    assert.ok(COMPLETION_BUNDLE_CONTRACT.forbids.includes("github_api_call"));
    assert.ok(COMPLETION_BUNDLE_CONTRACT.forbids.includes("mutation_execution"));
    assert.deepEqual(COMPLETION_BUNDLE_CONTRACT.consumes, ["lineage_handoff_pack_manifest"]);
  });

  it("creates a ready non-persisted completion bundle from a T059 handoff pack", () => {
    const handoff = handoffReady();
    const bundle = runCompletionBundle({ now: NOW, handoff_pack: handoff, bundle_label: "release-candidate:t060" });
    assert.equal(bundle.status, "completion_bundle_ready", JSON.stringify(bundle, null, 2));
    assert.equal(bundle.handoff_ref.handoff_pack_id, handoff.handoff_pack_id);
    assert.equal(bundle.handoff_ref.handoff_digest, handoff.handoff_digest);
    assert.equal(bundle.handoff_ref.audit_plan_id, handoff.audit_ref.audit_plan_id);
    assert.equal(bundle.bundle.kind, "dry_run_lineage_completion_bundle");
    assert.equal(bundle.bundle.entry_count, handoff.handoff_entries.length);
    assert.deepEqual(bundle.bundle.entry_kinds, handoff.handoff_entries.map((entry) => entry.kind));
    assert.equal(bundle.bundle.persisted, false);
    assert.equal(bundle.bundle.write_target, null);
    assert.ok(Object.values(bundle.guards).every((value) => value === true));
    assert.ok(Object.values(bundle.dry_run).every((value) => value === false));
    assert.deepEqual(validateCompletionBundleResult(bundle), { ok: true, issues: [] });

    const replay = runCompletionBundle({ now: NOW, handoff_pack: handoff, bundle_label: "release-candidate:t060" });
    assert.deepEqual(replay, bundle);
  });

  it("propagates valid blocked handoff packs without side effects", () => {
    const handoff = handoffBlocked();
    assert.equal(handoff.status, "blocked");
    const bundle = runCompletionBundle({ now: NOW, handoff_pack: handoff });
    assert.equal(bundle.status, "blocked", JSON.stringify(bundle, null, 2));
    assert.equal(bundle.decision, "completion_bundle_blocked");
    assert.equal(bundle.bundle.persisted, false);
    assert.equal(bundle.bundle.write_target, null);
    assert.deepEqual(validateCompletionBundleResult(bundle), { ok: true, issues: [] });
  });

  it("invalidates tampered handoff packs and read-back side effects", () => {
    const handoff = handoffReady();
    const stale = runCompletionBundle({ now: NOW, handoff_pack: { ...handoff, handoff_digest: "sha-fnv1a-00000000" } });
    assert.equal(stale.status, "invalid");
    assert.ok(stale.reasons.includes("invalid_t059_handoff_pack"));

    const ready = runCompletionBundle({ now: NOW, handoff_pack: handoff });
    const persisted = { ...ready, bundle: { ...ready.bundle, persisted: true } };
    const persistedValidation = validateCompletionBundleResult(persisted);
    assert.equal(persistedValidation.ok, false);
    assert.ok(persistedValidation.issues.some((entry) => entry.code === "bundle_persistence_forbidden"));

    const target = { ...ready, bundle: { ...ready.bundle, write_target: "docs/ops/completion.json" } };
    const targetValidation = validateCompletionBundleResult(target);
    assert.equal(targetValidation.ok, false);
    assert.ok(targetValidation.issues.some((entry) => entry.code === "write_target_forbidden"));

    const sideEffect = { ...ready, dry_run: { ...ready.dry_run, github_api_called: true } };
    const sideEffectValidation = validateCompletionBundleResult(sideEffect);
    assert.equal(sideEffectValidation.ok, false);
    assert.ok(sideEffectValidation.issues.some((entry) => entry.code === "side_effect_forbidden"));
  });

  it("rejects unsafe labels and supports stable aliases", () => {
    const handoff = handoffReady();
    const unsafe = runCompletionBundle({ now: NOW, handoff_pack: handoff, bundle_label: "github_pat_abc123" });
    assert.equal(unsafe.status, "invalid");
    assert.ok(unsafe.reasons.includes("label_contains_secret_material"));
    assert.equal(unsafe.bundle.label, "t060-completion-bundle");
    assert.deepEqual(validateCompletionBundleResult(unsafe), { ok: true, issues: [] });

    for (const fn of [createCompletionBundle, runT060CompletionBundle]) {
      const bundle = fn({ now: NOW, handoff_pack: handoff });
      assert.equal(bundle.status, "completion_bundle_ready");
      assert.deepEqual(validateT060CompletionBundle(bundle), { ok: true, issues: [] });
    }
  });
});
