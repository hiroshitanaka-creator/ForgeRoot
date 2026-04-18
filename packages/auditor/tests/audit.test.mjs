import test from "node:test";
import assert from "node:assert/strict";
import { runPlanner } from "../../planner/dist/run.js";
import { createBranchWorktreePlan } from "../../executor/dist/worktree.js";
import { createSandboxExecutionRequest } from "../../executor/dist/sandbox.js";
import {
  AUDITOR_RUNTIME_CONTRACT,
  runAuditor,
  validateAuditResult,
  validatePlanSpecForAudit,
  validateSandboxExecutionRequestForAudit,
} from "../dist/index.js";

const NOW = "2026-04-18T00:00:00Z";

function makePlan({ title = "docs: update setup guide", body = "Add setup notes to docs.", labels = ["forge:auto", "docs"], number = 23 } = {}) {
  const result = runPlanner({
    source: "intake_input",
    now: NOW,
    intake: {
      sourceKind: "issue",
      sourceKey: `issue:${number}`,
      repositoryFullName: "hiroshitanaka-creator/ForgeRoot",
      number,
      title,
      body,
      labels,
    },
  });
  assert.equal(result.status, "planned", result.reasons.join("\n"));
  assert.ok(result.plan);
  return result.plan;
}

function makeChain(plan = makePlan()) {
  const worktreeResult = createBranchWorktreePlan(plan, { now: NOW });
  assert.equal(worktreeResult.status, "ready", worktreeResult.reasons.join("\n"));
  assert.ok(worktreeResult.plan);
  const sandboxResult = createSandboxExecutionRequest(worktreeResult.plan, { now: NOW });
  assert.equal(sandboxResult.status, "ready", sandboxResult.reasons.join("\n"));
  assert.ok(sandboxResult.request);
  return { plan, worktreePlan: worktreeResult.plan, sandboxRequest: sandboxResult.request };
}

function observedFor(request, changedPaths = ["docs/setup.md"]) {
  return {
    command_ids: request.commands.map((command) => command.id),
    changed_paths: changedPaths,
    artifacts: request.artifacts.map((artifact) => ({
      path: artifact.path,
      bytes: Math.min(64, artifact.max_bytes),
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
    diff_lines: 42,
    command_results: commandResults,
    text_evidence: { summary: "bounded audit evidence" },
    ...overrides,
  };
}

test("complete docs evidence produces a passed audit report and allows later PR composition", () => {
  const chain = makeChain();
  const result = runAuditor({
    ...chain,
    sandboxOutput: observedFor(chain.sandboxRequest),
    evidence: evidenceFor(chain.plan),
    now: NOW,
  });

  assert.equal(result.status, "passed");
  assert.equal(result.decision, "allow_pr_composition");
  assert.ok(result.report);
  assert.equal(result.report.gates.pr_composition, "allowed");
  assert.equal(result.report.guards.no_pull_request_creation, true);
  assert.equal(result.report.guards.no_command_execution_in_auditor, true);
  assert.equal(validateAuditResult(result.report).ok, true);
});

test("missing sandbox observed output blocks audit instead of guessing", () => {
  const chain = makeChain();
  const result = runAuditor({ ...chain, evidence: evidenceFor(chain.plan), now: NOW });

  assert.equal(result.status, "blocked");
  assert.equal(result.decision, "block_pr_composition");
  assert.ok(result.reasons.some((reason) => reason.includes("sandbox observed output is required")));
  assert.equal(result.report?.evidence.sandbox_output_present, false);
});

test("mismatched plan/worktree/sandbox chain is invalid", () => {
  const chain = makeChain();
  const mismatchedRequest = { ...chain.sandboxRequest, plan_id: "forge-plan://different" };
  const result = runAuditor({
    ...chain,
    sandboxRequest: mismatchedRequest,
    sandboxOutput: observedFor(chain.sandboxRequest),
    evidence: evidenceFor(chain.plan),
    now: NOW,
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.decision, "invalid");
  assert.ok(result.findings.some((finding) => finding.message.includes("plan_id values differ")));
});

test("changed path outside mutable scope fails audit", () => {
  const chain = makeChain();
  const changedPaths = ["src/not-docs.ts"];
  const result = runAuditor({
    ...chain,
    sandboxOutput: observedFor(chain.sandboxRequest, changedPaths),
    evidence: evidenceFor(chain.plan, changedPaths),
    now: NOW,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.decision, "request_changes");
  assert.ok(result.report.evidence.changed_paths.some((path) => path.reason === "outside_mutable_scope"));
});

test("immutable governance path change fails audit", () => {
  const chain = makeChain();
  const changedPaths = [".forge/policies/runtime-mode.forge"];
  const result = runAuditor({
    ...chain,
    sandboxOutput: observedFor(chain.sandboxRequest, changedPaths),
    evidence: evidenceFor(chain.plan, changedPaths),
    now: NOW,
  });

  assert.equal(result.status, "failed");
  assert.ok(result.report.evidence.changed_paths.some((path) => path.reason === "immutable"));
});

test("missing required artifact fails audit", () => {
  const chain = makeChain();
  const output = observedFor(chain.sandboxRequest);
  const missing = { ...output, artifacts: output.artifacts.filter((artifact) => artifact.path !== "patch.diff") };
  const result = runAuditor({
    ...chain,
    sandboxOutput: missing,
    evidence: evidenceFor(chain.plan),
    now: NOW,
  });

  assert.equal(result.status, "failed");
  assert.ok(result.findings.some((finding) => finding.message.includes("required artifact 'patch.diff' is missing")));
});

test("undeclared artifact fails audit", () => {
  const chain = makeChain();
  const output = observedFor(chain.sandboxRequest);
  const withExtra = {
    ...output,
    artifacts: [...output.artifacts, { path: "extra.log", bytes: 10, media_type: "text/plain" }],
  };
  const result = runAuditor({
    ...chain,
    sandboxOutput: withExtra,
    evidence: evidenceFor(chain.plan),
    now: NOW,
  });

  assert.equal(result.status, "failed");
  assert.ok(result.findings.some((finding) => finding.message.includes("was not declared")));
});

test("undeclared observed command id fails audit", () => {
  const chain = makeChain();
  const output = { ...observedFor(chain.sandboxRequest), command_ids: [...chain.sandboxRequest.commands.map((command) => command.id), "surprise"] };
  const result = runAuditor({
    ...chain,
    sandboxOutput: output,
    evidence: evidenceFor(chain.plan),
    now: NOW,
  });

  assert.equal(result.status, "failed");
  assert.ok(result.findings.some((finding) => finding.message.includes("observed command 'surprise' was not declared")));
});

test("secret-looking observed environment fails audit", () => {
  const chain = makeChain();
  const output = { ...observedFor(chain.sandboxRequest), environment: { GITHUB_TOKEN: "ghp_" + "x".repeat(36) } };
  const result = runAuditor({
    ...chain,
    sandboxOutput: output,
    evidence: evidenceFor(chain.plan),
    now: NOW,
  });

  assert.equal(result.status, "failed");
  assert.ok(result.findings.some((finding) => finding.category === "safety_contract"));
});

test("command acceptance criteria pass with explicit command evidence and preserve human merge gate", () => {
  const plan = makePlan({ title: "bug: fix parser crash", body: "Parser crashes on empty input", labels: ["forge:auto", "bug"], number: 24 });
  const chain = makeChain(plan);
  const changedPaths = ["packages/planner/src/intake.ts"];
  const result = runAuditor({
    ...chain,
    sandboxOutput: observedFor(chain.sandboxRequest, changedPaths),
    evidence: evidenceFor(plan, changedPaths),
    now: NOW,
  });

  assert.equal(result.status, "passed");
  assert.equal(result.report.risk_summary.approval_class, "B");
  assert.equal(result.report.gates.merge, "human_review_required");
  assert.ok(result.report.acceptance.checks.some((check) => check.kind === "command" && check.status === "pass"));
});

test("command acceptance criteria fail when command exits non-zero", () => {
  const plan = makePlan({ title: "bug: fix parser crash", body: "Parser crashes on empty input", labels: ["forge:auto", "bug"], number: 25 });
  const chain = makeChain(plan);
  const changedPaths = ["packages/planner/src/intake.ts"];
  const evidence = evidenceFor(plan, changedPaths, {
    command_results: plan.acceptance_criteria
      .filter((criterion) => criterion.check.kind === "command")
      .map((criterion) => ({ id: "npm_test", command: criterion.check.command, exit_code: 1, outcome: "failed" })),
  });
  const result = runAuditor({
    ...chain,
    sandboxOutput: observedFor(chain.sandboxRequest, changedPaths),
    evidence,
    now: NOW,
  });

  assert.equal(result.status, "failed");
  assert.ok(result.report.acceptance.checks.some((check) => check.kind === "command" && check.status === "fail"));
});

test("validator rejects malformed audit report guard mutations", () => {
  const chain = makeChain();
  const result = runAuditor({
    ...chain,
    sandboxOutput: observedFor(chain.sandboxRequest),
    evidence: evidenceFor(chain.plan),
    now: NOW,
  });
  const mutated = {
    ...result.report,
    guards: { ...result.report.guards, no_pull_request_creation: false },
  };

  const validation = validateAuditResult(mutated);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.path === "/auditResult/guards/no_pull_request_creation"));
});

test("T023 public validators and contract expose auditor-only boundary", () => {
  const chain = makeChain();
  assert.equal(validatePlanSpecForAudit(chain.plan).ok, true);
  assert.equal(validateSandboxExecutionRequestForAudit(chain.sandboxRequest).ok, true);
  assert.ok(AUDITOR_RUNTIME_CONTRACT.forbids.includes("pull_request_creation"));
  assert.ok(AUDITOR_RUNTIME_CONTRACT.forbids.includes("command_execution_in_auditor"));
  assert.equal(AUDITOR_RUNTIME_CONTRACT.independentFromExecutor, true);
});
