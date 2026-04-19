import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runPlanner } from "../../planner/dist/run.js";
import { createBranchWorktreePlan, createSandboxExecutionRequest } from "../../executor/dist/index.js";
import { runAuditor } from "../../auditor/dist/index.js";
import {
  PR_COMPOSER_CONTRACT,
  composePR,
  composePr,
  composePullRequest,
  validatePRComposition,
  validatePrComposition,
  validatePullRequestComposition,
} from "../dist/index.js";

const NOW = "2026-04-18T00:00:00Z";

function makePlan({
  title = "docs: update setup guide",
  body = "Add one bounded setup note to docs/setup.md.",
  labels = ["forge:auto", "docs", "phase:P1", "class:A", "risk:low"],
  number = 24,
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
  return { plan, worktreePlan: worktreeResult.plan, sandboxRequest: sandboxResult.request, sandboxOutput, auditResult };
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
    text_evidence: { summary: "bounded PR composition evidence" },
    ...overrides,
  };
}

describe("T024 PR composer", () => {
  it("declares a composition-only contract with no GitHub mutation or merge authority", () => {
    assert.equal(PR_COMPOSER_CONTRACT.oneTaskOnePr, true);
    assert.equal(PR_COMPOSER_CONTRACT.composerOnly, true);
    assert.equal(PR_COMPOSER_CONTRACT.requiresPassedAudit, true);
    assert.ok(PR_COMPOSER_CONTRACT.consumes.includes("audit_result"));
    assert.ok(PR_COMPOSER_CONTRACT.produces.includes("pull_request_composition"));
    assert.ok(PR_COMPOSER_CONTRACT.forbids.includes("github_mutation"));
    assert.ok(PR_COMPOSER_CONTRACT.forbids.includes("merge_operation"));
    assert.ok(PR_COMPOSER_CONTRACT.forbids.includes("auto_approval"));
  });

  it("turns one passed audit chain into one deterministic PR composition manifest", () => {
    const chain = makeChain();
    assert.equal(chain.auditResult.status, "passed", JSON.stringify(chain.auditResult, null, 2));
    const result = composePullRequest({
      ...chain,
      auditResult: chain.auditResult.report,
      now: NOW,
      reviewers: ["@maintainer-one"],
      labels: ["ready-for-review"],
    });

    assert.equal(result.status, "ready", JSON.stringify(result, null, 2));
    assert.ok(result.composition);
    assert.equal(result.composition.schema_ref, "urn:forgeroot:pr-composition:v1");
    assert.equal(result.composition.plan_id, chain.plan.plan_id);
    assert.equal(result.composition.worktree_manifest_id, chain.worktreePlan.manifest_id);
    assert.equal(result.composition.sandbox_request_id, chain.sandboxRequest.request_id);
    assert.equal(result.composition.audit_id, chain.auditResult.report.audit_id);
    assert.equal(result.composition.pull_request.head, chain.worktreePlan.branch.name);
    assert.equal(result.composition.pull_request.base, "main");
    assert.equal(result.composition.pull_request.draft, true);
    assert.ok(result.composition.pull_request.title.startsWith("[ForgeRoot]"));
    assert.ok(result.composition.pull_request.body.includes("### Audit gate"));
    assert.ok(result.composition.pull_request.body.includes("### Safety gates preserved"));
    assert.ok(result.composition.pull_request.labels.includes("forge:pr-composed"));
    assert.ok(result.composition.pull_request.labels.includes("ready-for-review"));
    assert.deepEqual(result.composition.pull_request.reviewers, ["maintainer-one"]);
    assert.equal(result.composition.review.check_summary.acceptance_failed, 0);
    assert.equal(result.composition.guards.no_github_mutation, true);
    assert.equal(result.composition.guards.no_pull_request_creation_in_composer, true);
    assert.equal(result.composition.guards.no_merge_operation, true);
    assert.deepEqual(validatePullRequestComposition(result.composition), { ok: true, issues: [] });
    assert.deepEqual(validatePrComposition(result.composition), { ok: true, issues: [] });
    assert.deepEqual(validatePRComposition(result.composition), { ok: true, issues: [] });
  });

  it("supports audit run wrappers via auditResult.report and alias exports", () => {
    const chain = makeChain();
    const result = composePr({ ...chain, auditResult: chain.auditResult, now: NOW });
    const resultViaAlias = composePR({ ...chain, audit: chain.auditResult, now: NOW });
    assert.equal(result.status, "ready");
    assert.equal(resultViaAlias.status, "ready");
    assert.equal(result.composition.composition_id, resultViaAlias.composition.composition_id);
  });

  it("blocks composition when audit has not passed or does not allow PR composition", () => {
    const chain = makeChain();
    const blockedAudit = {
      ...chain.auditResult.report,
      status: "failed",
      decision: "request_changes",
      gates: { ...chain.auditResult.report.gates, pr_composition: "blocked" },
    };
    const result = composePullRequest({ ...chain, auditResult: blockedAudit, now: NOW });

    assert.equal(result.status, "blocked");
    assert.equal(result.composition, undefined);
    assert.ok(result.reasons.some((reason) => reason.includes("audit.status === passed")));
  });

  it("invalidates mismatched plan/worktree/sandbox/audit identity chains", () => {
    const chain = makeChain();
    const result = composePullRequest({
      ...chain,
      auditResult: { ...chain.auditResult.report, plan_id: "forge-plan://different" },
      now: NOW,
    });

    assert.equal(result.status, "invalid");
    assert.ok(result.issues.some((issue) => issue.path === "/chain/plan_id"));
  });

  it("invalidates branches that attempt to target the default branch", () => {
    const chain = makeChain();
    const badWorktree = { ...chain.worktreePlan, branch: { ...chain.worktreePlan.branch, name: "main" } };
    const badSandbox = { ...chain.sandboxRequest, branch: { ...chain.sandboxRequest.branch, name: "main" } };
    const result = composePullRequest({ ...chain, worktreePlan: badWorktree, sandboxRequest: badSandbox, auditResult: chain.auditResult.report, now: NOW });

    assert.equal(result.status, "invalid");
    assert.ok(result.reasons.some((reason) => reason.includes("default_branch")) || result.reasons.some((reason) => reason.includes("must start with 'forge/'")));
  });

  it("invalidates artifact evidence mismatches between sandbox output and audit result", () => {
    const chain = makeChain();
    const missingAuditArtifact = {
      ...chain.auditResult.report,
      evidence: { ...chain.auditResult.report.evidence, artifacts: chain.auditResult.report.evidence.artifacts.slice(1) },
    };
    const result = composePullRequest({ ...chain, auditResult: missingAuditArtifact, now: NOW });

    assert.equal(result.status, "invalid");
    assert.ok(result.issues.some((issue) => issue.path === "/chain/evidence/artifacts"));
  });

  it("validator rejects compositions that weaken composer safety guards", () => {
    const chain = makeChain();
    const result = composePullRequest({ ...chain, auditResult: chain.auditResult.report, now: NOW });
    assert.equal(result.status, "ready");
    const mutated = {
      ...result.composition,
      guards: { ...result.composition.guards, no_github_mutation: false },
    };
    const validation = validatePullRequestComposition(mutated);
    assert.equal(validation.ok, false);
    assert.ok(validation.issues.some((issue) => issue.path === "/composition/guards/no_github_mutation"));
  });
});
