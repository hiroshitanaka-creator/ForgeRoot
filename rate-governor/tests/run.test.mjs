import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runPlanner } from "../../planner/dist/run.js";
import { createBranchWorktreePlan, createSandboxExecutionRequest } from "../../executor/dist/index.js";
import { runAuditor } from "../../auditor/dist/index.js";
import { composePullRequest } from "../../pr-composer/dist/index.js";
import { prepareGitHubPullRequest } from "../../github-pr-adapter/dist/index.js";
import { runApprovalCheckpoint } from "../../approval-checkpoint/dist/index.js";
import {
  RATE_GOVERNOR_QUEUE_CONTRACT,
  deriveCooldownFromRateLimitResponse,
  deriveRateGovernorCooldown,
  enqueueTransportAuthorization,
  enqueueTrustedTransport,
  governGithubPullRequestTransport,
  governGitHubPullRequestTransport,
  governRateLimit,
  governTrustedTransport,
  queuePullRequestTransport,
  runRateGovernor,
  runRateGovernorQueue,
  validateGitHubTransportDispatch,
  validateGithubTransportDispatch,
  validateRateGovernorAuthorization,
  validateRateGovernorDecision,
  validateRateGovernorDispatch,
  validateRateGovernorQueueEntry,
  validateTrustedTransportAuthorizationForRateGovernor,
  validateTransportAuthorizationForRateGovernor,
} from "../dist/index.js";

const NOW = "2026-04-18T00:00:00Z";
let cachedAuthorization;

function makeAuthorization() {
  if (cachedAuthorization) return structuredClone(cachedAuthorization);
  const result = runPlanner({
    source: "intake_input",
    now: NOW,
    intake: {
      sourceKind: "issue",
      action: "opened",
      repositoryFullName: "hiroshitanaka-creator/ForgeRoot",
      number: 27,
      url: "https://github.com/hiroshitanaka-creator/ForgeRoot/issues/27",
      title: "docs: update setup guide",
      body: "Add one bounded setup note to docs/setup.md.",
      labels: ["forge:auto", "docs", "phase:P1", "class:A", "risk:low"],
    },
  });
  assert.equal(result.status, "planned", JSON.stringify(result, null, 2));
  const plan = result.plan;
  const worktree = createBranchWorktreePlan(plan, { now: NOW, defaultBranch: "main" });
  assert.equal(worktree.status, "ready", JSON.stringify(worktree, null, 2));
  const sandbox = createSandboxExecutionRequest(worktree.plan, { now: NOW });
  assert.equal(sandbox.status, "ready", JSON.stringify(sandbox, null, 2));
  const sandboxOutput = observedFor(sandbox.request);
  const audit = runAuditor({ plan, worktreePlan: worktree.plan, sandboxRequest: sandbox.request, sandboxOutput, evidence: evidenceFor(plan), now: NOW });
  assert.equal(audit.status, "passed", JSON.stringify(audit, null, 2));
  const composition = composePullRequest({ plan, worktreePlan: worktree.plan, sandboxRequest: sandbox.request, sandboxOutput, auditResult: audit.report, now: NOW, labels: ["ready-for-review"], reviewers: ["maintainer-one"], teamReviewers: ["core-reviewers"] });
  assert.equal(composition.status, "ready", JSON.stringify(composition, null, 2));
  const prepared = prepareGitHubPullRequest({ composition: composition.composition, installation: installation(), now: NOW, dryRun: false, runtime: liveRuntime(), rateLimit: liveRateLimit() });
  assert.equal(prepared.status, "ready", JSON.stringify(prepared, null, 2));
  const approval = runApprovalCheckpoint({ request: prepared.request, now: NOW });
  assert.equal(approval.status, "authorized", JSON.stringify(approval, null, 2));
  cachedAuthorization = structuredClone(approval.authorization);
  return structuredClone(cachedAuthorization);
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
    text_evidence: { summary: "bounded rate governor evidence" },
  };
}

function installation(overrides = {}) {
  return { installationId: 42, repositoryFullName: "hiroshitanaka-creator/ForgeRoot", permissions: { metadata: "read", contents: "write", pull_requests: "write", issues: "write", checks: "write", actions: "read" }, ...overrides };
}
function liveRuntime(overrides = {}) { return { operation: "open_pull_request", mode: "evolve", allowed: true, mutatingLaneOpen: true, killSwitchEngaged: false, cooldownUntil: null, liveTransportAllowed: true, ...overrides }; }
function liveRateLimit(overrides = {}) { return { writeLaneAvailable: true, contentCreateAllowed: true, retryAfterSeconds: null, minDelayMs: 1200, jitterMs: 800, liveTransportAllowed: true, ...overrides }; }

describe("T027 rate governor queue", () => {
  it("declares a queue-only contract with no live GitHub transport or rate-limit bypass authority", () => {
    assert.equal(RATE_GOVERNOR_QUEUE_CONTRACT.githubAppOnly, true);
    assert.equal(RATE_GOVERNOR_QUEUE_CONTRACT.queueOnly, true);
    assert.equal(RATE_GOVERNOR_QUEUE_CONTRACT.maxRepoMutatingLanes, 1);
    assert.equal(RATE_GOVERNOR_QUEUE_CONTRACT.contentCreateSoftCapPerMinute, 20);
    assert.equal(RATE_GOVERNOR_QUEUE_CONTRACT.newPullRequestsHardCapPerHourPerRepo, 5);
    assert.equal(RATE_GOVERNOR_QUEUE_CONTRACT.writeBaseDelayMs, 1200);
    assert.equal(RATE_GOVERNOR_QUEUE_CONTRACT.writeJitterMaxMs, 800);
    assert.ok(RATE_GOVERNOR_QUEUE_CONTRACT.consumes.includes("trusted_transport_authorization"));
    assert.ok(RATE_GOVERNOR_QUEUE_CONTRACT.produces.includes("rate_governor_dispatch_decision"));
    assert.ok(RATE_GOVERNOR_QUEUE_CONTRACT.forbids.includes("live_github_api_transport"));
    assert.ok(RATE_GOVERNOR_QUEUE_CONTRACT.forbids.includes("parallel_repo_mutating_lanes"));
  });

  it("queues one authorized PR transport into one repo mutating lane without performing GitHub transport", () => {
    const authorization = makeAuthorization();
    const result = runRateGovernor({ authorization, now: NOW });
    assert.equal(result.status, "queued", JSON.stringify(result, null, 2));
    assert.equal(result.dispatch.operation, "create_pull_request");
    assert.equal(result.dispatch.authorization_id, authorization.authorization_id);
    assert.equal(result.dispatch.lane.max_concurrency, 1);
    assert.equal(result.dispatch.lane.acquired, true);
    assert.equal(result.dispatch.transport.live_github_transport_performed, false);
    assert.equal(result.dispatch.transport.token_source, "github_app_installation");
    assert.equal(result.dispatch.budgets.content_create.limit_per_minute, 20);
    assert.equal(result.dispatch.budgets.pull_request_create.limit_per_hour, 5);
    assert.deepEqual(validateRateGovernorDispatch(result.dispatch), { ok: true, issues: [] });
    assert.deepEqual(validateRateGovernorQueueEntry(result.dispatch), { ok: true, issues: [] });
    assert.deepEqual(validateRateGovernorDecision(result.dispatch), { ok: true, issues: [] });
    assert.deepEqual(validateGitHubTransportDispatch(result.dispatch), { ok: true, issues: [] });
    assert.deepEqual(validateGithubTransportDispatch(result.dispatch), { ok: true, issues: [] });
  });

  it("supports aliases without changing the queue entry identity", () => {
    const authorization = makeAuthorization();
    const results = [governRateLimit, runRateGovernorQueue, enqueueTrustedTransport, enqueueTransportAuthorization, queuePullRequestTransport, governTrustedTransport, governGitHubPullRequestTransport, governGithubPullRequestTransport].map((fn) => fn({ authorization, now: NOW }));
    for (const result of results) assert.equal(result.status, "queued", JSON.stringify(result, null, 2));
    for (const result of results) assert.equal(result.dispatch.queue_entry_id, results[0].dispatch.queue_entry_id);
  });

  it("validates T026 transport authorization before queueing", () => {
    const authorization = makeAuthorization();
    assert.deepEqual(validateTransportAuthorizationForRateGovernor(authorization), { ok: true, issues: [] });
    assert.deepEqual(validateRateGovernorAuthorization(authorization), { ok: true, issues: [] });
    assert.deepEqual(validateTrustedTransportAuthorizationForRateGovernor(authorization), { ok: true, issues: [] });
    const invalid = { ...authorization, transport: { ...authorization.transport, token_source: "personal_access_token" } };
    const result = runRateGovernor({ authorization: invalid, now: NOW });
    assert.equal(result.status, "invalid", JSON.stringify(result, null, 2));
    assert.ok(result.issues.some((issue) => issue.code === "github_app_only" || issue.code === "literal"));
  });

  it("delays when the repository mutating lane is already occupied", () => {
    const result = runRateGovernor({ authorization: makeAuthorization(), now: NOW, rateState: { repoLane: { busy: true, ownerAuthorizationId: "forge-approval://other-task", lockedUntil: "2026-04-18T00:10:00Z" } } });
    assert.equal(result.status, "delayed", JSON.stringify(result, null, 2));
    assert.equal(result.dispatch.lane.acquired, false);
    assert.ok(result.issues.some((issue) => issue.code === "repo_mutating_lane_busy"));
    assert.deepEqual(validateRateGovernorDispatch(result.dispatch), { ok: true, issues: [] });
  });

  it("delays and preserves retry-after cooldown from rate-limit observations", () => {
    const result = runRateGovernor({ authorization: makeAuthorization(), now: NOW, rateLimitObservation: { statusCode: 429, headers: { "retry-after": "90" }, message: "You have exceeded a secondary rate limit." } });
    assert.equal(result.status, "delayed", JSON.stringify(result, null, 2));
    assert.equal(result.dispatch.cooldown.active, true);
    assert.equal(result.dispatch.cooldown.retry_after_seconds, 90);
    assert.equal(result.dispatch.cooldown.cooldown_until, "2026-04-18T00:01:30Z");
    assert.ok(result.issues.some((issue) => issue.code === "cooldown_active"));
  });

  it("delays when ForgeRoot content-create soft cap per minute is exhausted", () => {
    const result = runRateGovernor({ authorization: makeAuthorization(), now: NOW, rateState: { contentCreate: { perMinuteCount: 20, minuteResetAt: "2026-04-18T00:01:00Z" } } });
    assert.equal(result.status, "delayed", JSON.stringify(result, null, 2));
    assert.ok(result.issues.some((issue) => issue.code === "content_create_minute_cap"));
    assert.equal(result.dispatch.transport.execute_after, "2026-04-18T00:01:00Z");
  });

  it("delays when the per-repo PR creation hard cap is exhausted", () => {
    const result = runRateGovernor({ authorization: makeAuthorization(), now: NOW, rateState: { pullRequestCreate: { perHourCount: 5, hourResetAt: "2026-04-18T01:00:00Z" } } });
    assert.equal(result.status, "delayed", JSON.stringify(result, null, 2));
    assert.ok(result.issues.some((issue) => issue.code === "pr_create_hour_cap"));
    assert.equal(result.dispatch.transport.execute_after, "2026-04-18T01:00:00Z");
  });

  it("blocks when the latest runtime gate no longer permits trusted write transport", () => {
    const result = runRateGovernor({ authorization: makeAuthorization(), now: NOW, runtime: { mode: "observe", allowed: false, mutatingLaneOpen: false, killSwitchEngaged: false, liveTransportAllowed: false } });
    assert.equal(result.status, "blocked", JSON.stringify(result, null, 2));
    assert.equal(result.dispatch.status, "blocked");
    assert.ok(result.issues.some((issue) => issue.code === "runtime_mode_not_mutating"));
    assert.ok(result.issues.some((issue) => issue.code === "runtime_not_allowed"));
    assert.equal(result.dispatch.transport.live_github_transport_performed, false);
    assert.deepEqual(validateRateGovernorDispatch(result.dispatch), { ok: true, issues: [] });
  });

  it("derives cooldowns from retry-after, primary reset, and exponential secondary backoff", () => {
    const retryAfter = deriveRateGovernorCooldown({ statusCode: 403, headers: { "retry-after": "120" } }, { now: NOW });
    assert.equal(retryAfter.reason, "retry_after_header");
    assert.equal(retryAfter.cooldown_until, "2026-04-18T00:02:00Z");
    const resetEpoch = Math.floor(Date.parse("2026-04-18T00:05:00Z") / 1000);
    const primary = deriveCooldownFromRateLimitResponse({ statusCode: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetEpoch) } }, { now: NOW });
    assert.equal(primary.reason, "primary_rate_limit_reset_header");
    assert.equal(primary.cooldown_until, "2026-04-18T00:05:00Z");
    const secondary = deriveRateGovernorCooldown({ statusCode: 429, message: "secondary rate limit" }, { now: NOW, consecutiveFailures: 3 });
    assert.equal(secondary.reason, "secondary_rate_limit_exponential_backoff");
    assert.equal(secondary.cooldown_until, "2026-04-18T00:30:00Z");
  });
});
