import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runPlanner } from "../../planner/dist/run.js";
import { createBranchWorktreePlan, createSandboxExecutionRequest } from "../../executor/dist/index.js";
import { runAuditor } from "../../auditor/dist/index.js";
import { composePullRequest } from "../../pr-composer/dist/index.js";
import { prepareGitHubPullRequest } from "../../github-pr-adapter/dist/index.js";
import {
  APPROVAL_CHECKPOINT_CONTRACT,
  authorizeGithubPullRequestTransport,
  authorizeGitHubPullRequestTransport,
  checkApprovalCheckpoint,
  checkpointApproval,
  evaluateApprovalCheckpoint,
  runApprovalCheckpoint,
  validateApprovalCheckpointAuthorization,
  validateGitHubPullRequestCreationRequestForApproval,
  validateGitHubPRCreationRequestForApproval,
  validatePullRequestTransportAuthorization,
  validateTransportAuthorization,
  validateTrustedTransportAuthorization,
} from "../dist/index.js";

const NOW = "2026-04-18T00:00:00Z";

let cachedClassARequest;

function makePlan({ labels = ["forge:auto", "docs", "phase:P1", "class:A", "risk:low"], number = 26 } = {}) {
  const result = runPlanner({
    source: "intake_input",
    now: NOW,
    intake: {
      sourceKind: "issue",
      action: "opened",
      repositoryFullName: "hiroshitanaka-creator/ForgeRoot",
      number,
      url: `https://github.com/hiroshitanaka-creator/ForgeRoot/issues/${number}`,
      title: "docs: update setup guide",
      body: "Add one bounded setup note to docs/setup.md.",
      labels,
    },
  });
  assert.equal(result.status, "planned", JSON.stringify(result, null, 2));
  return result.plan;
}

function makeRequest() {
  if (cachedClassARequest) return structuredClone(cachedClassARequest);
  const plan = makePlan();
  const worktree = createBranchWorktreePlan(plan, { now: NOW, defaultBranch: "main" });
  assert.equal(worktree.status, "ready", JSON.stringify(worktree, null, 2));
  const sandbox = createSandboxExecutionRequest(worktree.plan, { now: NOW });
  assert.equal(sandbox.status, "ready", JSON.stringify(sandbox, null, 2));
  const sandboxOutput = observedFor(sandbox.request);
  const audit = runAuditor({ plan, worktreePlan: worktree.plan, sandboxRequest: sandbox.request, sandboxOutput, evidence: evidenceFor(plan), now: NOW });
  assert.equal(audit.status, "passed", JSON.stringify(audit, null, 2));
  const composition = composePullRequest({
    plan,
    worktreePlan: worktree.plan,
    sandboxRequest: sandbox.request,
    sandboxOutput,
    auditResult: audit.report,
    now: NOW,
    labels: ["ready-for-review"],
    reviewers: ["maintainer-one"],
    teamReviewers: ["core-reviewers"],
  });
  assert.equal(composition.status, "ready", JSON.stringify(composition, null, 2));
  const prepared = prepareGitHubPullRequest({
    composition: composition.composition,
    installation: installation(),
    now: NOW,
    dryRun: false,
    runtime: liveRuntime(),
    rateLimit: liveRateLimit(),
  });
  assert.equal(prepared.status, "ready", JSON.stringify(prepared, null, 2));
  cachedClassARequest = structuredClone(prepared.request);
  return structuredClone(prepared.request);
}

function observedFor(request, changedPaths = ["docs/setup.md"]) {
  return {
    command_ids: request.commands.map((command) => command.id),
    changed_paths: changedPaths,
    diff_summary: { files_changed: changedPaths.length, lines_added: 10, lines_deleted: 1, total_lines_changed: 11 },
    artifacts: request.artifacts.map((artifact) => ({ path: artifact.path, bytes: 128, media_type: artifact.media_type, sha256: "sha256:" + "a".repeat(64) })),
    environment: { CI: "1", FORGE_SANDBOX: "1" },
  };
}

function evidenceFor(plan, changedPaths = ["docs/setup.md"]) {
  return {
    changed_paths: changedPaths,
    files_changed: changedPaths.length,
    diff_lines: 11,
    command_results: plan.acceptance_criteria
      .filter((criterion) => criterion.check.kind === "command" && criterion.check.command)
      .map((criterion) => ({ id: criterion.check.command.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64), command: criterion.check.command, exit_code: criterion.check.expected_exit_code ?? 0, outcome: "passed" })),
    text_evidence: { summary: "bounded approval checkpoint evidence" },
  };
}

function installation(overrides = {}) {
  return {
    installationId: 42,
    repositoryFullName: "hiroshitanaka-creator/ForgeRoot",
    permissions: {
      metadata: "read",
      contents: "write",
      pull_requests: "write",
      issues: "write",
      checks: "write",
      actions: "read",
    },
    ...overrides,
  };
}

function liveRuntime(overrides = {}) {
  return {
    operation: "open_pull_request",
    mode: "evolve",
    allowed: true,
    mutatingLaneOpen: true,
    killSwitchEngaged: false,
    cooldownUntil: null,
    ...overrides,
  };
}

function liveRateLimit(overrides = {}) {
  return {
    writeLaneAvailable: true,
    contentCreateAllowed: true,
    retryAfterSeconds: null,
    minDelayMs: 1200,
    jitterMs: 800,
    ...overrides,
  };
}

function humanApproval(overrides = {}) {
  return {
    approval_ref: "review://maintainer-one/1",
    approver: "maintainer-one",
    approved: true,
    approved_at: NOW,
    code_owner: false,
    ...overrides,
  };
}

function withReview(request, review) {
  const next = { ...request.review_gate, ...review };
  if (next.approval_class !== "A" || next.risk !== "low") {
    next.human_review_required_before_merge = true;
    next.merge_gate = "human_review_required";
  }
  return { ...request, review_gate: next };
}

describe("T026 approval checkpoint", () => {
  it("declares a checkpoint-only contract with no transport, merge, or approval mutation authority", () => {
    assert.equal(APPROVAL_CHECKPOINT_CONTRACT.githubAppOnly, true);
    assert.equal(APPROVAL_CHECKPOINT_CONTRACT.oneTaskOnePr, true);
    assert.equal(APPROVAL_CHECKPOINT_CONTRACT.checkpointOnly, true);
    assert.ok(APPROVAL_CHECKPOINT_CONTRACT.consumes.includes("github_pull_request_creation_request"));
    assert.ok(APPROVAL_CHECKPOINT_CONTRACT.produces.includes("trusted_transport_authorization"));
    assert.ok(APPROVAL_CHECKPOINT_CONTRACT.forbids.includes("live_github_api_transport"));
    assert.ok(APPROVAL_CHECKPOINT_CONTRACT.forbids.includes("merge_operation"));
    assert.ok(APPROVAL_CHECKPOINT_CONTRACT.forbids.includes("auto_approval"));
    assert.ok(APPROVAL_CHECKPOINT_CONTRACT.forbids.includes("self_approval"));
  });

  it("authorizes Class A low-risk non-dry-run PR transport when runtime and rate gates pass", () => {
    const request = makeRequest();
    const result = runApprovalCheckpoint({ request, now: NOW });

    assert.equal(result.status, "authorized", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "authorize");
    assert.ok(result.authorization);
    assert.equal(result.authorization.schema_ref, "urn:forgeroot:transport-authorization:v1");
    assert.equal(result.authorization.request_id, request.request_id);
    assert.equal(result.authorization.repository.full_name, "hiroshitanaka-creator/ForgeRoot");
    assert.equal(result.authorization.transport.token_source, "github_app_installation");
    assert.equal(result.authorization.transport.token_material_included, false);
    assert.equal(result.authorization.gates.github_api_transport, "deferred_to_transport_worker");
    assert.equal(result.authorization.gates.merge, "not_authorized");
    assert.equal(result.authorization.guards.no_pull_request_creation_in_checkpoint, true);
    assert.deepEqual(validateTransportAuthorization(result.authorization), { ok: true, issues: [] });
    assert.deepEqual(validateApprovalCheckpointAuthorization(result.authorization), { ok: true, issues: [] });
    assert.deepEqual(validateTrustedTransportAuthorization(result.authorization), { ok: true, issues: [] });
    assert.deepEqual(validatePullRequestTransportAuthorization(result.authorization), { ok: true, issues: [] });
  });

  it("holds dry-run requests before trusted transport", () => {
    const request = { ...makeRequest(), dry_run: true, runtime_gate: { ...makeRequest().runtime_gate, live_transport_allowed: false }, rate_limit_gate: { ...makeRequest().rate_limit_gate, live_transport_allowed: false } };
    const result = runApprovalCheckpoint({ request, now: NOW });

    assert.equal(result.status, "held", JSON.stringify(result, null, 2));
    assert.equal(result.authorization, undefined);
    assert.ok(result.issues.some((issue) => issue.path === "/request/dry_run"));
  });

  it("holds Class B transport until a human approval record is present", () => {
    const request = withReview(makeRequest(), { approval_class: "B", risk: "medium" });
    const result = runApprovalCheckpoint({ request, now: NOW });

    assert.equal(result.status, "held", JSON.stringify(result, null, 2));
    assert.equal(result.authorization, undefined);
    assert.ok(result.issues.some((issue) => issue.path === "/human_approvals"));
  });

  it("authorizes Class B transport after a non-self human approval", () => {
    const request = withReview(makeRequest(), { approval_class: "B", risk: "medium" });
    const result = authorizeGitHubPullRequestTransport({ request, humanApproval: humanApproval(), now: NOW });
    const aliasResult = authorizeGithubPullRequestTransport({ request, humanApproval: humanApproval(), now: NOW });

    assert.equal(result.status, "authorized", JSON.stringify(result, null, 2));
    assert.equal(aliasResult.status, "authorized");
    assert.equal(result.authorization.review_gate.human_approval_count, 1);
    assert.equal(result.authorization.review_gate.required_human_approval_count, 1);
    assert.equal(result.authorization.human_approvals[0].approver, "maintainer-one");
  });

  it("supports checkpoint aliases without changing the authorization decision", () => {
    const request = makeRequest();
    const results = [
      evaluateApprovalCheckpoint({ request, now: NOW }),
      checkApprovalCheckpoint({ request, now: NOW }),
      checkpointApproval({ request, now: NOW }),
    ];

    for (const result of results) assert.equal(result.status, "authorized", JSON.stringify(result, null, 2));
    assert.equal(results[0].authorization.authorization_id, results[1].authorization.authorization_id);
    assert.equal(results[0].authorization.authorization_id, results[2].authorization.authorization_id);
  });

  it("quarantines halted runtime and kill-switch states", () => {
    const request = makeRequest();
    const result = runApprovalCheckpoint({ request, runtime: liveRuntime({ mode: "halted", killSwitchEngaged: true }), now: NOW });

    assert.equal(result.status, "quarantined", JSON.stringify(result, null, 2));
    assert.equal(result.authorization, undefined);
    assert.ok(result.issues.some((issue) => issue.code === "runtime_quarantine"));
    assert.ok(result.issues.some((issue) => issue.code === "kill_switch"));
  });

  it("quarantines Class D, critical risk, and governance mutation surfaces", () => {
    const request = withReview(makeRequest(), { approval_class: "D", risk: "critical" });
    const mutatedBody = `${request.primary_request.body.body}\n### Changed paths\n- .github/workflows/ci.yml\n`;
    const mutated = { ...request, primary_request: { ...request.primary_request, body: { ...request.primary_request.body, body: mutatedBody } } };
    const result = runApprovalCheckpoint({ request: mutated, humanApproval: humanApproval({ code_owner: true }), now: NOW });

    assert.equal(result.status, "quarantined", JSON.stringify(result, null, 2));
    assert.ok(result.issues.some((issue) => issue.code === "human_only"));
    assert.ok(result.issues.some((issue) => issue.code === "critical_risk"));
    assert.ok(result.issues.some((issue) => issue.code === "governance_mutation"));
  });

  it("invalidates malformed request manifests and merge endpoints", () => {
    const request = makeRequest();
    const validation = validateGitHubPullRequestCreationRequestForApproval({ ...request, primary_request: { ...request.primary_request, path: "/repos/hiroshitanaka-creator/ForgeRoot/pulls/1/merge" } });
    const aliasValidation = validateGitHubPRCreationRequestForApproval(request);
    const result = runApprovalCheckpoint({ request: { ...request, status: "not_ready" }, now: NOW });

    assert.equal(validation.ok, false);
    assert.ok(validation.issues.some((issue) => issue.code === "forbidden_endpoint"));
    assert.deepEqual(aliasValidation, { ok: true, issues: [] });
    assert.equal(result.status, "invalid", JSON.stringify(result, null, 2));
  });

  it("validator rejects token or private key material in generated authorizations", () => {
    const result = runApprovalCheckpoint({ request: makeRequest(), now: NOW });
    assert.equal(result.status, "authorized", JSON.stringify(result, null, 2));
    const mutated = { ...result.authorization, transport: { ...result.authorization.transport, accidentally_persisted_header: "Bearer ghp_not_a_real_token" } };
    const validation = validateTransportAuthorization(mutated);

    assert.equal(validation.ok, false);
    assert.ok(validation.issues.some((issue) => issue.code === "secret_leak"));
  });
});
