import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPlanSpecFromTaskCandidate } from "../../planner/dist/plan-schema.js";
import { createBranchWorktreePlan, createSandboxExecutionRequest } from "../../executor/dist/index.js";
import {
  AUDITOR_RUNTIME_CONTRACT,
  runAuditor,
  validateAuditResult,
  validateAuditReport,
} from "../dist/index.js";

const CREATED_AT = "2026-04-18T00:00:00Z";

function auditorTask(overrides = {}) {
  return {
    candidateId: "issue:23",
    sourceKey: "issue:23",
    sourceKind: "issue",
    repositoryFullName: "hiroshitanaka-creator/ForgeRoot",
    number: 23,
    url: "https://github.com/hiroshitanaka-creator/ForgeRoot/issues/23",
    title: "[P1][T023] Auditor runtime",
    summary: "Add an independent auditor runtime before PR composition.",
    category: "test",
    risk: "medium",
    approvalClass: "B",
    labels: ["forge:auto", "phase:P1", "class:B", "risk:medium"],
    autoRequested: true,
    bodyExcerpt: "Audit plan, worktree, sandbox request, and sandbox output; do not compose PRs.",
    plannerHints: {
      oneTaskOnePr: true,
      recommendedScope: "auditor runtime only",
      mutablePathHints: ["packages/auditor/**", "docs/**", ".forge/agents/auditor.alpha.forge", "README.md", ".forge/README.md"],
      forbiddenPathHints: [".github/workflows/**", ".forge/policies/**", ".forge/network/**"],
      requiresHumanReviewBeforePlanning: false,
    },
    ...overrides,
  };
}

function fixtures(taskOverrides = {}, worktreeOptions = {}, sandboxOptions = {}) {
  const plan = createPlanSpecFromTaskCandidate(auditorTask(taskOverrides), { createdAt: CREATED_AT });
  const worktreeResult = createBranchWorktreePlan(plan, { now: CREATED_AT, defaultBranch: "main", ...worktreeOptions });
  assert.equal(worktreeResult.status, "ready", JSON.stringify(worktreeResult, null, 2));
  const sandboxResult = createSandboxExecutionRequest(worktreeResult.plan, { now: CREATED_AT, ...sandboxOptions });
  assert.equal(sandboxResult.status, "ready", JSON.stringify(sandboxResult, null, 2));
  return { plan, worktreePlan: worktreeResult.plan, sandboxRequest: sandboxResult.request };
}

function passingOutput(request, changedPaths = ["packages/auditor/src/run.ts", "packages/auditor/tests/run.test.mjs", "docs/specs/t023-validation-report.md", ".forge/agents/auditor.alpha.forge"]) {
  return {
    command_ids: request.commands.map((command) => command.id),
    changed_paths: changedPaths,
    diff_summary: {
      files_changed: changedPaths.length,
      lines_added: 640,
      lines_deleted: 18,
      total_lines_changed: 658,
    },
    artifacts: request.artifacts
      .filter((artifact) => artifact.required)
      .map((artifact) => ({ path: artifact.path, bytes: Math.min(2048, artifact.max_bytes), media_type: artifact.media_type, sha256: `sha256:${"a".repeat(64)}` })),
    environment: { FORGE_SANDBOX: "1" },
  };
}

function commandEvidence(plan) {
  return {
    command_results: plan.acceptance_criteria
      .filter((criterion) => criterion.check.kind === "command")
      .map((criterion) => ({ command: criterion.check.command, exit_code: criterion.check.expected_exit_code ?? 0 })),
  };
}

describe("T023 auditor runtime", () => {
  it("declares an independent audit-only contract", () => {
    assert.equal(AUDITOR_RUNTIME_CONTRACT.oneTaskOnePr, true);
    assert.equal(AUDITOR_RUNTIME_CONTRACT.independentFromExecutor, true);
    assert.ok(AUDITOR_RUNTIME_CONTRACT.consumes.includes("plan_spec"));
    assert.ok(AUDITOR_RUNTIME_CONTRACT.consumes.includes("sandbox_observed_output"));
    assert.ok(AUDITOR_RUNTIME_CONTRACT.produces.includes("audit_result"));
    assert.ok(AUDITOR_RUNTIME_CONTRACT.forbids.includes("pull_request_creation"));
    assert.ok(AUDITOR_RUNTIME_CONTRACT.forbids.includes("github_mutation"));
    assert.ok(AUDITOR_RUNTIME_CONTRACT.forbids.includes("command_execution_in_auditor"));
  });

  it("passes one valid plan/worktree/sandbox/output chain and emits a validated audit result", () => {
    const { plan, worktreePlan, sandboxRequest } = fixtures();
    const result = runAuditor({
      plan,
      worktreePlan,
      sandboxRequest,
      sandboxOutput: passingOutput(sandboxRequest),
      evidence: commandEvidence(plan),
      now: CREATED_AT,
    });

    assert.equal(result.status, "passed", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "allow_pr_composition");
    assert.equal(result.report.schema_ref, "urn:forgeroot:audit-result:v1");
    assert.equal(result.report.plan_id, plan.plan_id);
    assert.equal(result.report.worktree_manifest_id, worktreePlan.manifest_id);
    assert.equal(result.report.sandbox_request_id, sandboxRequest.request_id);
    assert.equal(result.report.gates.pr_composition, "allowed");
    assert.equal(result.report.guards.no_pull_request_creation, true);
    assert.equal(result.report.guards.no_github_mutation, true);
    assert.deepEqual(validateAuditResult(result.report), { ok: true, issues: [] });
    assert.deepEqual(validateAuditReport(result.report), { ok: true, issues: [] });
  });

  it("blocks PR composition when sandbox observed output is missing", () => {
    const { plan, worktreePlan, sandboxRequest } = fixtures();
    const result = runAuditor({ plan, worktreePlan, sandboxRequest, evidence: commandEvidence(plan), now: CREATED_AT });

    assert.equal(result.status, "blocked");
    assert.equal(result.decision, "block_pr_composition");
    assert.equal(result.report.gates.pr_composition, "blocked");
    assert.ok(result.reasons.some((reason) => reason.includes("sandbox observed output is required")));
  });

  it("invalidates mismatched plan/worktree/sandbox identities before PR composition", () => {
    const { plan, worktreePlan, sandboxRequest } = fixtures();
    const result = runAuditor({
      plan,
      worktreePlan: { ...worktreePlan, plan_id: "forge-plan://different" },
      sandboxRequest,
      sandboxOutput: passingOutput(sandboxRequest),
      evidence: commandEvidence(plan),
      now: CREATED_AT,
    });

    assert.equal(result.status, "invalid");
    assert.equal(result.decision, "invalid");
    assert.ok(result.reasons.some((reason) => reason.includes("Plan Spec and branch/worktree manifest plan_id values differ")));
  });

  it("fails when sandbox output touches immutable or out-of-scope paths", () => {
    const { plan, worktreePlan, sandboxRequest } = fixtures();
    const result = runAuditor({
      plan,
      worktreePlan,
      sandboxRequest,
      sandboxOutput: passingOutput(sandboxRequest, ["packages/auditor/src/run.ts", ".github/workflows/ci.yml", "src/unrelated.ts"]),
      evidence: commandEvidence(plan),
      now: CREATED_AT,
    });

    assert.equal(result.status, "failed");
    assert.equal(result.decision, "request_changes");
    assert.ok(result.findings.some((finding) => finding.message.includes("immutable scope")));
    assert.ok(result.findings.some((finding) => finding.message.includes("outside mutable scope")));
  });

  it("fails missing required artifacts and undeclared artifact output", () => {
    const { plan, worktreePlan, sandboxRequest } = fixtures();
    const output = passingOutput(sandboxRequest);
    const result = runAuditor({
      plan,
      worktreePlan,
      sandboxRequest,
      sandboxOutput: {
        ...output,
        artifacts: [output.artifacts[0], { path: "undeclared.json", bytes: 10, media_type: "application/json" }],
      },
      evidence: commandEvidence(plan),
      now: CREATED_AT,
    });

    assert.equal(result.status, "failed");
    assert.ok(result.findings.some((finding) => finding.message.includes("was not declared")));
    assert.ok(result.findings.some((finding) => finding.message.includes("required artifact")));
  });

  it("fails when observed output exposes secret-looking environment data", () => {
    const { plan, worktreePlan, sandboxRequest } = fixtures();
    const result = runAuditor({
      plan,
      worktreePlan,
      sandboxRequest,
      sandboxOutput: { ...passingOutput(sandboxRequest), environment: { GITHUB_TOKEN: "ghp_notallowed" } },
      evidence: commandEvidence(plan),
      now: CREATED_AT,
    });

    assert.equal(result.status, "failed");
    assert.ok(result.findings.some((finding) => finding.message.includes("secret-bearing")));
    assert.ok(result.findings.some((finding) => finding.message.includes("secret value")));
  });

  it("invalidates approval class rewrites between plan and sandbox request", () => {
    const { plan, worktreePlan, sandboxRequest } = fixtures();
    const result = runAuditor({
      plan,
      worktreePlan,
      sandboxRequest: { ...sandboxRequest, approval: { ...sandboxRequest.approval, approval_class: "A" } },
      sandboxOutput: passingOutput(sandboxRequest),
      evidence: commandEvidence(plan),
      now: CREATED_AT,
    });

    assert.equal(result.status, "invalid");
    assert.ok(result.reasons.some((reason) => reason.includes("approval class differs")));
  });

  it("rejects malformed audit result objects", () => {
    const validation = validateAuditResult({ schema_ref: "bad" });
    assert.equal(validation.ok, false);
    assert.ok(validation.issues.length > 0);
  });
});
