import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  E2E_FORGED_PR_DEMO_CONTRACT,
  runEndToEndDemo,
  runEndToEndForgedPrDemo,
  runE2EForgedPrDemo,
  runForgeDemo,
  runT028Demo,
  validateE2EForgedPrDemo,
  validateEndToEndForgedPrDemo,
  validateForgeDemo,
  validateT028Demo,
} from "../dist/index.js";

const NOW = "2026-04-18T00:00:00Z";
const HUMAN_APPROVAL = {
  approval_ref: "review://maintainer-one/1",
  approver: "maintainer-one",
  approved: true,
  approved_at: NOW,
  code_owner: false,
};

function readyDemo(overrides = {}) {
  const result = runEndToEndForgedPrDemo({ now: NOW, ...overrides });
  assert.equal(result.status, "ready", JSON.stringify(result, null, 2));
  return result;
}

function step(result, name) {
  return result.steps.find((item) => item.name === name);
}

describe("T028 end-to-end forged PR demo", () => {
  it("declares a manifest-only demo contract without live GitHub transport authority", () => {
    assert.equal(E2E_FORGED_PR_DEMO_CONTRACT.oneTaskOnePr, true);
    assert.equal(E2E_FORGED_PR_DEMO_CONTRACT.demoOnly, true);
    assert.ok(E2E_FORGED_PR_DEMO_CONTRACT.consumes.includes("forge_auto_issue_like_input"));
    assert.ok(E2E_FORGED_PR_DEMO_CONTRACT.consumes.includes("trusted_transport_authorization"));
    assert.ok(E2E_FORGED_PR_DEMO_CONTRACT.produces.includes("full_phase1_manifest_chain"));
    assert.ok(E2E_FORGED_PR_DEMO_CONTRACT.produces.includes("rate_governed_dispatch_manifest"));
    assert.ok(E2E_FORGED_PR_DEMO_CONTRACT.forbids.includes("live_github_api_transport"));
    assert.ok(E2E_FORGED_PR_DEMO_CONTRACT.forbids.includes("real_pull_request_creation"));
    assert.ok(E2E_FORGED_PR_DEMO_CONTRACT.forbids.includes("merge_operation"));
    assert.ok(E2E_FORGED_PR_DEMO_CONTRACT.forbids.includes("memory_or_evaluation_updates"));
    assert.ok(E2E_FORGED_PR_DEMO_CONTRACT.forbids.includes("network_or_federation_behavior"));
  });

  it("runs one forge:auto issue through the full Phase 1 manifest chain to rate-governed dispatch", () => {
    const result = readyDemo();

    assert.equal(result.decision, "demo_chain_ready");
    assert.equal(result.steps.length, 8);
    assert.deepEqual(result.steps.map((item) => item.name), [
      "planner",
      "worktree_manager",
      "sandbox_harness",
      "auditor",
      "pr_composer",
      "github_pr_adapter",
      "approval_checkpoint",
      "rate_governor",
    ]);
    assert.equal(step(result, "planner")?.status, "planned");
    assert.equal(step(result, "auditor")?.status, "passed");
    assert.equal(step(result, "rate_governor")?.status, "queued");
    assert.equal(result.chain.rateGovernorDispatch.transport.live_github_transport_performed, false);
    assert.equal(result.invariants.one_task_one_pr, true);
    assert.equal(result.invariants.source_issue_count, 1);
    assert.equal(result.invariants.no_default_branch_write, true);
    assert.equal(result.invariants.live_github_transport_performed, false);
    assert.equal(result.invariants.real_pull_request_created, false);
    assert.deepEqual(validateEndToEndForgedPrDemo(result), { ok: true, issues: [] });
  });

  it("keeps risk summary, acceptance criteria, and approval gate visible in the PR composition", () => {
    const result = readyDemo({ labels: ["forge:auto", "phase:P1", "class:A", "risk:low"] });
    const body = result.chain.prComposition.pull_request.body;

    assert.match(body, /### Review gate/);
    assert.match(body, /Approval class/);
    assert.match(body, /Risk/);
    assert.match(body, /### Acceptance criteria/);
    assert.equal(result.invariants.pr_body_contains_risk_summary, true);
    assert.equal(result.invariants.pr_body_contains_acceptance_criteria, true);
    assert.equal(result.invariants.approval_gate_preserved, true);
    assert.equal(result.summary.approval_class, "A");
    assert.equal(result.summary.risk, "low");
  });

  it("blocks before planning when the issue is not automation-labeled", () => {
    const result = runEndToEndForgedPrDemo({ now: NOW, issue: { labels: ["docs", "phase:P1", "class:A", "risk:low"] } });

    assert.equal(result.status, "blocked", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "blocked_before_pr_transport");
    assert.equal(step(result, "planner")?.status, "ignored");
    assert.equal(result.chain.plan, undefined);
    assert.ok(result.reasons.includes("planner_ignored"));
    assert.deepEqual(validateEndToEndForgedPrDemo(result), { ok: true, issues: [] });
  });

  it("blocks before audit when the simulated sandbox output exceeds mutable scope", () => {
    const result = runEndToEndForgedPrDemo({ now: NOW, changedPaths: [".forge/policies/runtime-mode.forge"] });

    assert.equal(result.status, "blocked", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "blocked_before_pr_transport");
    assert.equal(step(result, "sandbox_harness")?.status, "ready");
    assert.equal(result.chain.auditResult, undefined);
    assert.equal(result.chain.prComposition, undefined);
    assert.ok(result.reasons.includes("sandbox_observed_output_failed_validation"));
    assert.deepEqual(validateEndToEndForgedPrDemo(result), { ok: true, issues: [] });
  });

  it("delays before transport when the rate governor content-create budget is exhausted", () => {
    const result = runEndToEndForgedPrDemo({
      now: NOW,
      rateState: { contentCreate: { perMinuteCount: 20, minuteResetAt: "2026-04-18T00:01:00Z" } },
    });

    assert.equal(result.status, "delayed", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "delayed_before_transport");
    assert.equal(step(result, "rate_governor")?.status, "delayed");
    assert.equal(result.summary.rate_governor_status, "delayed");
    assert.equal(result.invariants.live_github_transport_performed, false);
    assert.ok(result.reasons.some((reason) => reason.includes("content_create_minute_cap")));
    assert.deepEqual(validateEndToEndForgedPrDemo(result), { ok: true, issues: [] });
  });

  it("holds Class B before transport until human approval is provided, then queues", () => {
    const issue = { labels: ["forge:auto", "docs", "phase:P1", "class:B", "risk:medium"] };
    const held = runEndToEndForgedPrDemo({ now: NOW, issue });
    assert.equal(held.status, "blocked", JSON.stringify(held, null, 2));
    assert.equal(step(held, "approval_checkpoint")?.status, "held");
    assert.ok(held.reasons.some((reason) => reason.includes("approval_required")));

    const approved = readyDemo({ issue, humanApproval: HUMAN_APPROVAL });
    assert.equal(approved.summary.approval_class, "B");
    assert.equal(approved.summary.risk, "medium");
    assert.equal(approved.chain.transportAuthorization.review_gate.human_approval_count, 1);
    assert.equal(approved.chain.rateGovernorDispatch.status, "queued");
  });

  it("supports aliases and validators without changing the ready decision", () => {
    const results = [runForgeDemo, runEndToEndDemo, runE2EForgedPrDemo, runT028Demo].map((fn) => fn({ now: NOW }));
    for (const result of results) {
      assert.equal(result.status, "ready", JSON.stringify(result, null, 2));
      assert.deepEqual(validateForgeDemo(result), { ok: true, issues: [] });
      assert.deepEqual(validateE2EForgedPrDemo(result), { ok: true, issues: [] });
      assert.deepEqual(validateT028Demo(result), { ok: true, issues: [] });
    }
    assert.equal(results[0].summary.dispatch_id, results[1].summary.dispatch_id);
    assert.equal(results[0].summary.dispatch_id, results[2].summary.dispatch_id);
    assert.equal(results[0].summary.dispatch_id, results[3].summary.dispatch_id);
  });
});
