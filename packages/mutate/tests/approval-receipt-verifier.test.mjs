import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPROVAL_RECEIPT_VERIFIER_CONTRACT,
  createApprovalReceiptVerification,
  createNVersionAuditRouting,
  runApprovalReceiptVerifier,
  runEvolutionGuard,
  runMutationPrGenerator,
  runMutationPrTransport,
  runT054ApprovalReceiptVerifier,
  runTransportReadinessLedger,
  validateApprovalReceiptVerification,
  validateApprovalReceiptVerifierResult,
  validateT054ApprovalReceiptVerifier,
  verifyApprovalReceipt,
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
    evidence_digest: `sha-fnv1a-bad0000${index}`,
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

function readyLedger() {
  const plan = runMutationPrGenerator({
    now: NOW,
    guard: acceptedGuard(),
    repository: "hiroshitanaka-creator/ForgeRoot",
    labels: ["t054"],
    reviewers: ["@maintainer-one"],
  });
  const request = runMutationPrTransport({ now: NOW, plan, installation_id: 12345 });
  return runTransportReadinessLedger({ now: NOW, request });
}

function receiptFor(ledger, overrides = {}) {
  return {
    receipt_id: "approval-receipt-aaaaaaaa",
    approver: "maintainer-one",
    approved_at: NOW,
    decision: "approve",
    statement: "I approve this dry-run mutation PR transport readiness manifest for the next gated phase.",
    evidence_digest: "sha-fnv1a-feed0001",
    scope: {
      ledger_id: ledger.ledger_id,
      ledger_digest: ledger.ledger_digest,
      request_id: ledger.request_ref.request_id,
      request_digest: ledger.request_ref.request_digest,
      plan_id: ledger.request_ref.plan_id,
    },
    ...overrides,
  };
}

describe("T054 approval receipt verifier", () => {
  it("declares a deterministic verifier-only approval receipt contract", () => {
    assert.equal(APPROVAL_RECEIPT_VERIFIER_CONTRACT.deterministic, true);
    assert.equal(APPROVAL_RECEIPT_VERIFIER_CONTRACT.verifierOnly, true);
    assert.equal(APPROVAL_RECEIPT_VERIFIER_CONTRACT.dryRunOnly, true);
    assert.ok(APPROVAL_RECEIPT_VERIFIER_CONTRACT.consumes.includes("transport_readiness_replay_ledger"));
    assert.ok(APPROVAL_RECEIPT_VERIFIER_CONTRACT.validates.includes("receipt_scope_digest_match"));
    assert.ok(APPROVAL_RECEIPT_VERIFIER_CONTRACT.forbids.includes("approval_record_write"));
    assert.ok(APPROVAL_RECEIPT_VERIFIER_CONTRACT.forbids.includes("live_github_transport"));
  });

  it("verifies a scoped human approval receipt for a ready T053 ledger", () => {
    const ledger = readyLedger();
    assert.equal(ledger.status, "ready", JSON.stringify(ledger, null, 2));

    const result = runApprovalReceiptVerifier({
      now: NOW,
      ledger,
      receipts: [receiptFor(ledger)],
      policy: { allowed_approvers: ["maintainer-one"] },
    });

    assert.equal(result.status, "approved", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "human_approval_verified");
    assert.equal(result.ledger_ref.ledger_id, ledger.ledger_id);
    assert.equal(result.ledger_ref.request_digest, ledger.request_ref.request_digest);
    assert.equal(result.policy.required_approvals, 1);
    assert.deepEqual(result.policy.allowed_approvers, ["maintainer-one"]);
    assert.equal(result.approval_summary.accepted_approvals, 1);
    assert.deepEqual(result.approval_summary.approvers, ["maintainer-one"]);
    assert.equal(result.review_gate.approval_record_write_authorized, false);
    assert.equal(result.guards.no_approval_record_write, true);
    assert.equal(result.dry_run.approval_record_written, false);
    assert.equal(result.dry_run.github_api_called, false);
    assert.deepEqual(validateApprovalReceiptVerifierResult(result), { ok: true, issues: [] });
    assert.deepEqual(validateApprovalReceiptVerification(result), { ok: true, issues: [] });

    const replay = runApprovalReceiptVerifier({ now: NOW, ledger, receipts: [receiptFor(ledger)], policy: { allowed_approvers: ["maintainer-one"] } });
    assert.equal(replay.verifier_id, result.verifier_id);
    assert.equal(replay.approval_digest, result.approval_digest);
  });

  it("blocks missing, rejected, held, disallowed, or non-ready approvals without writing records", () => {
    const ledger = readyLedger();

    const missing = runApprovalReceiptVerifier({ now: NOW, ledger, receipts: [], policy: { required_approvals: 1 } });
    assert.equal(missing.status, "blocked", JSON.stringify(missing, null, 2));
    assert.ok(missing.reasons.includes("missing_required_approvals"));
    assert.equal(missing.dry_run.approval_record_written, false);
    assert.deepEqual(validateApprovalReceiptVerifierResult(missing), { ok: true, issues: [] });

    const rejected = runApprovalReceiptVerifier({ now: NOW, ledger, receipts: [receiptFor(ledger, { decision: "reject" })] });
    assert.equal(rejected.status, "blocked");
    assert.ok(rejected.reasons.includes("receipt_rejected"));

    const held = runApprovalReceiptVerifier({ now: NOW, ledger, receipts: [receiptFor(ledger, { decision: "hold" })] });
    assert.equal(held.status, "blocked");
    assert.ok(held.reasons.includes("receipt_hold"));

    const disallowed = runApprovalReceiptVerifier({ now: NOW, ledger, receipts: [receiptFor(ledger)], policy: { allowed_approvers: ["other-maintainer"] } });
    assert.equal(disallowed.status, "blocked");
    assert.ok(disallowed.reasons.includes("approver_not_allowed"));

    const blockedLedger = { ...ledger, status: "blocked", decision: "transport_replay_blocked", reasons: ["transport_replay_blocked"], summary: { ...ledger.summary, fail_count: 1 } };
    const nonReady = runApprovalReceiptVerifier({ now: NOW, ledger: blockedLedger, receipts: [receiptFor(blockedLedger)] });
    assert.equal(nonReady.status, "invalid");
    assert.ok(nonReady.reasons.includes("invalid_t053_readiness_ledger"));
  });

  it("invalidates tampered scope, duplicate receipts, bad policy, malformed receipts, and secrets", () => {
    const ledger = readyLedger();

    const mismatchedScope = runApprovalReceiptVerifier({
      now: NOW,
      ledger,
      receipts: [receiptFor(ledger, { scope: { ...receiptFor(ledger).scope, request_digest: "sha-fnv1a-00000000" } })],
    });
    assert.equal(mismatchedScope.status, "invalid");
    assert.ok(mismatchedScope.reasons.includes("request_digest_mismatch"));

    const duplicate = runApprovalReceiptVerifier({ now: NOW, ledger, receipts: [receiptFor(ledger), receiptFor(ledger)] });
    assert.equal(duplicate.status, "invalid");
    assert.ok(duplicate.reasons.includes("duplicate_receipt_id"));

    const badPolicy = runApprovalReceiptVerifier({ now: NOW, ledger, receipts: [receiptFor(ledger)], policy: { required_approvals: 0 } });
    assert.equal(badPolicy.status, "invalid");
    assert.ok(badPolicy.reasons.includes("invalid_required_approvals"));

    const secret = runApprovalReceiptVerifier({
      now: NOW,
      ledger,
      receipts: [receiptFor(ledger, { statement: "Bearer abc" })],
    });
    assert.equal(secret.status, "invalid");
    assert.ok(secret.reasons.includes("secret_material_forbidden"));
  });

  it("rejects tampered verifier manifests, side effects, guard weakening, and stale digests", () => {
    const ledger = readyLedger();
    const result = runApprovalReceiptVerifier({ now: NOW, ledger, receipts: [receiptFor(ledger)] });
    assert.equal(result.status, "approved", JSON.stringify(result, null, 2));

    const sideEffect = { ...result, dry_run: { ...result.dry_run, approval_record_written: true } };
    assert.equal(validateApprovalReceiptVerifierResult(sideEffect).ok, false);
    assert.ok(validateApprovalReceiptVerifierResult(sideEffect).issues.some((entry) => entry.code === "side_effect_forbidden"));

    const weakGuard = { ...result, guards: { ...result.guards, no_approval_record_write: false } };
    assert.equal(validateApprovalReceiptVerifierResult(weakGuard).ok, false);
    assert.ok(validateApprovalReceiptVerifierResult(weakGuard).issues.some((entry) => entry.path === "guards.no_approval_record_write"));

    const staleDigest = { ...result, approval_digest: "sha-fnv1a-00000000" };
    assert.equal(validateApprovalReceiptVerifierResult(staleDigest).ok, false);
    assert.ok(validateApprovalReceiptVerifierResult(staleDigest).issues.some((entry) => entry.code === "approval_digest_mismatch"));

    const approvedWithMissing = { ...result, approval_summary: { ...result.approval_summary, missing_approvals: 1 } };
    assert.equal(validateApprovalReceiptVerifierResult(approvedWithMissing).ok, false);
    assert.ok(validateApprovalReceiptVerifierResult(approvedWithMissing).issues.some((entry) => entry.code === "approved_with_unmet_receipts" || entry.code === "approval_summary_mismatch"));

    const approvedWithBlockedLedgerRef = { ...result, ledger_ref: { ...result.ledger_ref, ledger_status: "blocked" } };
    assert.equal(validateApprovalReceiptVerifierResult(approvedWithBlockedLedgerRef).ok, false);
    assert.ok(validateApprovalReceiptVerifierResult(approvedWithBlockedLedgerRef).issues.some((entry) => entry.code === "approved_ledger_not_ready"));
  });

  it("supports stable aliases", () => {
    const ledger = readyLedger();
    for (const fn of [verifyApprovalReceipt, createApprovalReceiptVerification, runT054ApprovalReceiptVerifier]) {
      const result = fn({ now: NOW, ledger, receipts: [receiptFor(ledger)] });
      assert.equal(result.status, "approved");
      assert.deepEqual(validateT054ApprovalReceiptVerifier(result), { ok: true, issues: [] });
    }
  });
});
