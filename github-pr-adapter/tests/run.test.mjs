import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runPlanner } from "../../planner/dist/run.js";
import { createBranchWorktreePlan, createSandboxExecutionRequest } from "../../executor/dist/index.js";
import { runAuditor } from "../../auditor/dist/index.js";
import { composePullRequest } from "../../pr-composer/dist/index.js";
import {
  GITHUB_PR_ADAPTER_CONTRACT,
  prepareGithubPR,
  prepareGithubPullRequest,
  prepareGitHubPR,
  prepareGitHubPullRequest,
  validateGithubPRCreationRequest,
  validateGithubPullRequestCreationRequest,
  validateGitHubPRCreationRequest,
  validateGitHubPullRequestCreationRequest,
} from "../dist/index.js";

const NOW = "2026-04-18T00:00:00Z";

function makePlan({
  title = "docs: update setup guide",
  body = "Add one bounded setup note to docs/setup.md.",
  labels = ["forge:auto", "docs", "phase:P1", "class:A", "risk:low"],
  number = 25,
} = {}) {
  const result = runPlanner({
    source: "intake_input",
    now: NOW,
    intake: {
      sourceKind: "issue",
      action: "opened",
      repositoryFullName: "hiroshitanaka-creator/ForgeRoot",
      number,
      url: `https://github.com/hiroshitanaka-creator/ForgeRoot/issues/${number}`,
      title,
      body,
      labels,
    },
  });
  assert.equal(result.status, "planned", JSON.stringify(result, null, 2));
  assert.ok(result.plan);
  return result.plan;
}

function makeChain(plan = makePlan(), changedPaths = ["docs/setup.md"]) {
  const worktreeResult = createBranchWorktreePlan(plan, { now: NOW, defaultBranch: "main" });
  assert.equal(worktreeResult.status, "ready", JSON.stringify(worktreeResult, null, 2));
  const sandboxResult = createSandboxExecutionRequest(worktreeResult.plan, { now: NOW });
  assert.equal(sandboxResult.status, "ready", JSON.stringify(sandboxResult, null, 2));
  const sandboxOutput = observedFor(sandboxResult.request, changedPaths);
  const auditResult = runAuditor({
    plan,
    worktreePlan: worktreeResult.plan,
    sandboxRequest: sandboxResult.request,
    sandboxOutput,
    evidence: evidenceFor(plan, changedPaths),
    now: NOW,
  });
  assert.equal(auditResult.status, "passed", JSON.stringify(auditResult, null, 2));
  const compositionResult = composePullRequest({
    plan,
    worktreePlan: worktreeResult.plan,
    sandboxRequest: sandboxResult.request,
    sandboxOutput,
    auditResult: auditResult.report,
    now: NOW,
    reviewers: ["@maintainer-one"],
    teamReviewers: ["core-reviewers"],
    labels: ["ready-for-review"],
  });
  assert.equal(compositionResult.status, "ready", JSON.stringify(compositionResult, null, 2));
  return { plan, worktreePlan: worktreeResult.plan, sandboxRequest: sandboxResult.request, sandboxOutput, auditResult, composition: compositionResult.composition };
}

function observedFor(request, changedPaths = ["docs/setup.md"]) {
  return {
    command_ids: request.commands.map((command) => command.id),
    changed_paths: changedPaths,
    diff_summary: {
      files_changed: changedPaths.length,
      lines_added: 12,
      lines_deleted: 2,
      total_lines_changed: 14,
    },
    artifacts: request.artifacts.map((artifact) => ({
      path: artifact.path,
      bytes: Math.min(128, artifact.max_bytes),
      media_type: artifact.media_type,
      sha256: "sha256:" + "a".repeat(64),
    })),
    environment: { CI: "1", FORGE_SANDBOX: "1" },
  };
}

function evidenceFor(plan, changedPaths = ["docs/setup.md"], overrides = {}) {
  const commandResults = [];
  for (const criterion of plan.acceptance_criteria) {
    if (criterion.check.kind === "command" && criterion.check.command) {
      commandResults.push({
        id: criterion.check.command.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64),
        command: criterion.check.command,
        exit_code: criterion.check.expected_exit_code ?? 0,
        outcome: "passed",
      });
    }
  }
  return {
    changed_paths: changedPaths,
    files_changed: changedPaths.length,
    diff_lines: 14,
    command_results: commandResults,
    text_evidence: { summary: "bounded GitHub PR adapter evidence" },
    ...overrides,
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

describe("T025 GitHub PR adapter", () => {
  it("declares a GitHub-App-only adapter boundary with no merge or approval authority", () => {
    assert.equal(GITHUB_PR_ADAPTER_CONTRACT.githubAppOnly, true);
    assert.equal(GITHUB_PR_ADAPTER_CONTRACT.dryRunSupported, true);
    assert.equal(GITHUB_PR_ADAPTER_CONTRACT.oneTaskOnePr, true);
    assert.equal(GITHUB_PR_ADAPTER_CONTRACT.adapterOnly, true);
    assert.ok(GITHUB_PR_ADAPTER_CONTRACT.consumes.includes("pull_request_composition"));
    assert.ok(GITHUB_PR_ADAPTER_CONTRACT.produces.includes("github_pull_request_creation_request"));
    assert.ok(GITHUB_PR_ADAPTER_CONTRACT.forbids.includes("merge_operation"));
    assert.ok(GITHUB_PR_ADAPTER_CONTRACT.forbids.includes("auto_approval"));
    assert.ok(GITHUB_PR_ADAPTER_CONTRACT.forbids.includes("pat_or_user_token_use"));
  });

  it("turns one PR composition into one deterministic dry-run GitHub App PR creation request", () => {
    const { composition } = makeChain();
    const result = prepareGitHubPullRequest({ composition, installation: installation(), now: NOW });

    assert.equal(result.status, "ready", JSON.stringify(result, null, 2));
    assert.ok(result.request);
    assert.equal(result.request.schema_ref, "urn:forgeroot:github-pr-create-request:v1");
    assert.equal(result.request.dry_run, true);
    assert.equal(result.request.repository.full_name, "hiroshitanaka-creator/ForgeRoot");
    assert.equal(result.request.authentication.token_source, "github_app_installation");
    assert.equal(result.request.authentication.token_request.path, "/app/installations/42/access_tokens");
    assert.deepEqual(result.request.authentication.token_request.repositories, ["ForgeRoot"]);
    assert.deepEqual(result.request.authentication.token_request.permissions, { pull_requests: "write" });
    assert.equal(result.request.primary_request.method, "POST");
    assert.equal(result.request.primary_request.path, "/repos/hiroshitanaka-creator/ForgeRoot/pulls");
    assert.equal(result.request.primary_request.body.title, composition.pull_request.title);
    assert.equal(result.request.primary_request.body.head, composition.pull_request.head);
    assert.equal(result.request.primary_request.body.base, "main");
    assert.equal(result.request.primary_request.body.draft, true);
    assert.equal(result.request.primary_request.body.maintainer_can_modify, false);
    assert.ok(result.request.post_create_requests.some((request) => request.name === "add_labels_to_pull_request_issue"));
    assert.ok(result.request.post_create_requests.some((request) => request.name === "request_pull_request_reviewers"));
    assert.equal(result.request.runtime_gate.live_transport_allowed, false);
    assert.equal(result.request.rate_limit_gate.live_transport_allowed, false);
    assert.deepEqual(validateGitHubPullRequestCreationRequest(result.request), { ok: true, issues: [] });
    assert.deepEqual(validateGithubPullRequestCreationRequest(result.request), { ok: true, issues: [] });
    assert.deepEqual(validateGitHubPRCreationRequest(result.request), { ok: true, issues: [] });
    assert.deepEqual(validateGithubPRCreationRequest(result.request), { ok: true, issues: [] });
  });

  it("supports alias exports for adapter ergonomics", () => {
    const { composition } = makeChain();
    const input = { composition, installation: installation(), now: NOW };
    const a = prepareGithubPullRequest(input);
    const b = prepareGitHubPR(input);
    const c = prepareGithubPR(input);

    assert.equal(a.status, "ready");
    assert.equal(b.status, "ready");
    assert.equal(c.status, "ready");
    assert.equal(a.request.request_id, b.request.request_id);
    assert.equal(a.request.request_id, c.request.request_id);
  });

  it("blocks non-dry-run transport without explicit runtime and rate-limit gates", () => {
    const { composition } = makeChain();
    const result = prepareGitHubPullRequest({ composition, installation: installation(), now: NOW, dryRun: false });

    assert.equal(result.status, "blocked", JSON.stringify(result, null, 2));
    assert.equal(result.request, undefined);
    assert.ok(result.issues.some((issue) => issue.path === "/runtime"));
    assert.ok(result.issues.some((issue) => issue.path === "/rateLimit"));
  });

  it("allows non-dry-run request preparation only when runtime and rate gates pass", () => {
    const { composition } = makeChain();
    const result = prepareGitHubPullRequest({
      composition,
      installation: installation(),
      now: NOW,
      dryRun: false,
      runtime: liveRuntime(),
      rateLimit: liveRateLimit(),
    });

    assert.equal(result.status, "ready", JSON.stringify(result, null, 2));
    assert.equal(result.request.dry_run, false);
    assert.equal(result.request.runtime_gate.live_transport_allowed, true);
    assert.equal(result.request.rate_limit_gate.live_transport_allowed, true);
    assert.deepEqual(validateGitHubPullRequestCreationRequest(result.request), { ok: true, issues: [] });
  });

  it("invalidates installation and composition repository mismatches", () => {
    const { composition } = makeChain();
    const result = prepareGitHubPullRequest({ composition, installation: installation({ repositoryFullName: "octocat/Hello-World" }), now: NOW });

    assert.equal(result.status, "invalid", JSON.stringify(result, null, 2));
    assert.ok(result.issues.some((issue) => issue.path === "/installation/repositoryFullName" && issue.code === "mismatch"));
  });

  it("invalidates attempts to use the default branch as the head branch", () => {
    const { composition } = makeChain();
    const badComposition = { ...composition, pull_request: { ...composition.pull_request, head: "main" } };
    const result = prepareGitHubPullRequest({ composition: badComposition, installation: installation(), now: NOW });

    assert.equal(result.status, "invalid", JSON.stringify(result, null, 2));
    assert.ok(result.issues.some((issue) => issue.path === "/composition/pull_request/head"));
  });

  it("validator rejects generated requests that target merge endpoints", () => {
    const { composition } = makeChain();
    const result = prepareGitHubPullRequest({ composition, installation: installation(), now: NOW });
    assert.equal(result.status, "ready");
    const mutated = {
      ...result.request,
      primary_request: { ...result.request.primary_request, path: "/repos/hiroshitanaka-creator/ForgeRoot/pulls/1/merge" },
    };
    const validation = validateGitHubPullRequestCreationRequest(mutated);

    assert.equal(validation.ok, false);
    assert.ok(validation.issues.some((issue) => issue.code === "forbidden_endpoint"));
  });

  it("validator rejects token or private key material in prepared requests", () => {
    const { composition } = makeChain();
    const result = prepareGitHubPullRequest({ composition, installation: installation(), now: NOW });
    assert.equal(result.status, "ready");
    const mutated = {
      ...result.request,
      authentication: { ...result.request.authentication, accidentally_persisted_header: "Bearer ghp_not_a_real_token" },
    };
    const validation = validateGitHubPullRequestCreationRequest(mutated);

    assert.equal(validation.ok, false);
    assert.ok(validation.issues.some((issue) => issue.code === "secret_leak"));
  });

  it("invalidates unsafe labels and reviewer metadata before request preparation", () => {
    const { composition } = makeChain();
    const badComposition = {
      ...composition,
      pull_request: { ...composition.pull_request, labels: ["ok", "bad\nlabel"], reviewers: ["bad/reviewer"] },
    };
    const result = prepareGitHubPullRequest({ composition: badComposition, installation: installation(), now: NOW });

    assert.equal(result.status, "invalid", JSON.stringify(result, null, 2));
    assert.ok(result.issues.some((issue) => issue.path === "/composition/pull_request/labels/1"));
    assert.ok(result.issues.some((issue) => issue.path === "/composition/pull_request/reviewers/0"));
  });
});
