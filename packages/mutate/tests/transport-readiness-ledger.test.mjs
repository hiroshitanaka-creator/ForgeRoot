import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TRANSPORT_READINESS_LEDGER_CONTRACT,
  createNVersionAuditRouting,
  createTransportReadinessLedger,
  replayMutationPrTransportReadiness,
  runEvolutionGuard,
  runMutationPrGenerator,
  runMutationPrTransport,
  runT053TransportReadinessLedger,
  runTransportReadinessLedger,
  validateT053TransportReadinessLedger,
  validateTransportReadinessLedger,
  validateTransportReadinessLedgerResult,
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
    evidence_digest: `sha-fnv1a-fad0000${index}`,
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

function readyRequest(overrides = {}) {
  const plan = runMutationPrGenerator({
    now: NOW,
    guard: acceptedGuard(),
    repository: "hiroshitanaka-creator/ForgeRoot",
    labels: ["t053"],
    reviewers: ["@maintainer-one"],
  });
  return runMutationPrTransport({ now: NOW, plan, installation_id: 12345, ...overrides });
}

describe("T053 transport readiness ledger", () => {
  it("declares a deterministic ledger-only readiness contract", () => {
    assert.equal(TRANSPORT_READINESS_LEDGER_CONTRACT.deterministic, true);
    assert.equal(TRANSPORT_READINESS_LEDGER_CONTRACT.ledgerOnly, true);
    assert.equal(TRANSPORT_READINESS_LEDGER_CONTRACT.dryRunOnly, true);
    assert.ok(TRANSPORT_READINESS_LEDGER_CONTRACT.consumes.includes("dry_run_mutation_pr_transport_request_manifest"));
    assert.ok(TRANSPORT_READINESS_LEDGER_CONTRACT.validates.includes("t052_read_back_validation"));
    assert.ok(TRANSPORT_READINESS_LEDGER_CONTRACT.forbids.includes("live_github_transport"));
    assert.ok(TRANSPORT_READINESS_LEDGER_CONTRACT.forbids.includes("token_request"));
    assert.ok(TRANSPORT_READINESS_LEDGER_CONTRACT.forbids.includes("file_write"));
  });

  it("creates a deterministic ready ledger from a ready T052 request", () => {
    const request = readyRequest();
    assert.equal(request.status, "transport_request_ready", JSON.stringify(request, null, 2));

    const result = runTransportReadinessLedger({ now: NOW, request });

    assert.equal(result.status, "ready", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "transport_replay_ready");
    assert.equal(result.request_ref.request_id, request.request_id);
    assert.equal(result.request_ref.request_digest, request.request_digest);
    assert.equal(result.request_ref.repository_full_name, "hiroshitanaka-creator/ForgeRoot");
    assert.equal(result.summary.fail_count, 0);
    assert.equal(result.summary.pending_count, 0);
    assert.deepEqual(result.summary.missing_required_check_ids, []);
    assert.ok(result.checks.some((entry) => entry.check_id === "dry-run-only" && entry.status === "pass"));
    assert.ok(result.checks.some((entry) => entry.check_id === "safe-pr-endpoint" && entry.status === "pass"));
    assert.equal(result.runtime_gate.live_transport_allowed, false);
    assert.equal(result.guards.no_github_api_call, true);
    assert.equal(result.guards.no_token_request, true);
    assert.equal(result.dry_run.github_api_called, false);
    assert.equal(result.dry_run.file_written, false);
    assert.deepEqual(validateTransportReadinessLedgerResult(result), { ok: true, issues: [] });
    assert.deepEqual(validateTransportReadinessLedger(result), { ok: true, issues: [] });

    const replay = runTransportReadinessLedger({ now: NOW, request });
    assert.equal(replay.ledger_id, result.ledger_id);
    assert.equal(replay.ledger_digest, result.ledger_digest);
    assert.deepEqual(replay.checks, result.checks);
  });

  it("blocks failed, pending, missing, or non-ready transport requests without side effects", () => {
    const request = readyRequest();
    const failed = runTransportReadinessLedger({
      now: NOW,
      request,
      checks: [{ check_id: "manual-release-window", category: "manual", status: "fail", summary: "release window not approved" }],
    });
    assert.equal(failed.status, "blocked", JSON.stringify(failed, null, 2));
    assert.ok(failed.reasons.includes("required_check_failed"));
    assert.equal(failed.dry_run.github_api_called, false);
    assert.deepEqual(validateTransportReadinessLedgerResult(failed), { ok: true, issues: [] });

    const pending = runTransportReadinessLedger({
      now: NOW,
      request,
      checks: [{ check_id: "manual-review-thread", category: "manual", status: "pending", summary: "review thread not resolved" }],
    });
    assert.equal(pending.status, "blocked");
    assert.ok(pending.reasons.includes("required_check_pending"));

    const missing = runTransportReadinessLedger({ now: NOW, request, required_check_ids: ["dry-run-only", "missing-manual-check"] });
    assert.equal(missing.status, "blocked");
    assert.deepEqual(missing.summary.missing_required_check_ids, ["missing-manual-check"]);

    const blockedRequest = runMutationPrTransport({ now: NOW, plan: runMutationPrGenerator({ now: NOW, guard: acceptedGuard({ reviews: [] }) }) });
    const blockedLedger = runTransportReadinessLedger({ now: NOW, request: blockedRequest });
    assert.equal(blockedLedger.status, "blocked");
    assert.ok(blockedLedger.checks.some((entry) => entry.check_id === "t052-manifest-ready" && entry.status === "fail"));
    assert.deepEqual(validateTransportReadinessLedgerResult(blockedLedger), { ok: true, issues: [] });
  });

  it("invalidates tampered T052 requests and malformed manual checks", () => {
    const request = readyRequest();

    const staleRequest = runTransportReadinessLedger({ now: NOW, request: { ...request, request_digest: "sha-fnv1a-00000000" } });
    assert.equal(staleRequest.status, "invalid");
    assert.ok(staleRequest.reasons.includes("invalid_t052_transport_manifest"));

    const duplicateChecks = runTransportReadinessLedger({
      now: NOW,
      request,
      checks: [
        { check_id: "manual-review", category: "manual", status: "pass", summary: "ok" },
        { check_id: "manual-review", category: "manual", status: "pass", summary: "duplicate" },
      ],
    });
    assert.equal(duplicateChecks.status, "invalid");
    assert.ok(duplicateChecks.reasons.includes("duplicate_check_id"));

    const secretCheck = runTransportReadinessLedger({
      now: NOW,
      request,
      checks: [{ check_id: "manual-token", category: "manual", status: "pass", summary: "Bearer abc" }],
    });
    assert.equal(secretCheck.status, "invalid");
    assert.ok(secretCheck.reasons.includes("secret_material_forbidden"));
  });

  it("rejects tampered ledgers, side effects, stale digests, and ready ledgers with failed checks", () => {
    const result = runTransportReadinessLedger({ now: NOW, request: readyRequest() });
    assert.equal(result.status, "ready", JSON.stringify(result, null, 2));

    const sideEffect = { ...result, dry_run: { ...result.dry_run, github_api_called: true } };
    assert.equal(validateTransportReadinessLedgerResult(sideEffect).ok, false);
    assert.ok(validateTransportReadinessLedgerResult(sideEffect).issues.some((entry) => entry.code === "side_effect_forbidden"));

    const weakGuard = { ...result, guards: { ...result.guards, no_token_request: false } };
    assert.equal(validateTransportReadinessLedgerResult(weakGuard).ok, false);
    assert.ok(validateTransportReadinessLedgerResult(weakGuard).issues.some((entry) => entry.path === "guards.no_token_request"));

    const failedReady = {
      ...result,
      checks: [{ ...result.checks[0], status: "fail" }],
      summary: { ...result.summary, pass_count: result.summary.pass_count - 1, fail_count: 1 },
    };
    assert.equal(validateTransportReadinessLedgerResult(failedReady).ok, false);
    assert.ok(validateTransportReadinessLedgerResult(failedReady).issues.some((entry) => entry.code === "ready_with_unmet_checks"));

    const staleDigest = { ...result, ledger_digest: "sha-fnv1a-00000000" };
    assert.equal(validateTransportReadinessLedgerResult(staleDigest).ok, false);
    assert.ok(validateTransportReadinessLedgerResult(staleDigest).issues.some((entry) => entry.code === "ledger_digest_mismatch"));
  });

  it("supports stable aliases", () => {
    for (const fn of [createTransportReadinessLedger, replayMutationPrTransportReadiness, runT053TransportReadinessLedger]) {
      const result = fn({ now: NOW, request: readyRequest() });
      assert.equal(result.status, "ready");
      assert.deepEqual(validateT053TransportReadinessLedger(result), { ok: true, issues: [] });
    }
  });
});
