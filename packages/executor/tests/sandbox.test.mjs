import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPlanSpecFromTaskCandidate } from "../../planner/dist/plan-schema.js";
import {
  EXECUTOR_SANDBOX_HARNESS_CONTRACT,
  createBranchWorktreePlan,
  createSandboxExecutionRequest,
  validateSandboxExecutionRequest,
  validateSandboxObservedOutput,
} from "../dist/index.js";

const CREATED_AT = "2026-04-18T00:00:00Z";

function executorTask(overrides = {}) {
  return {
    candidateId: "issue:43",
    sourceKey: "issue:43",
    sourceKind: "issue",
    repositoryFullName: "hiroshitanaka-creator/ForgeRoot",
    number: 43,
    url: "https://github.com/hiroshitanaka-creator/ForgeRoot/issues/43",
    title: "[P1][T019] Executor sandbox harness",
    summary: "Add deterministic sandbox request validation before any executor command can run.",
    category: "test",
    risk: "medium",
    approvalClass: "B",
    labels: ["forge:auto", "phase:P1", "class:B", "risk:medium"],
    autoRequested: true,
    bodyExcerpt: "Prepare a sandbox execution request; do not run commands or mutate GitHub.",
    plannerHints: {
      oneTaskOnePr: true,
      recommendedScope: "executor sandbox harness only",
      mutablePathHints: ["packages/executor/**", "docs/**", ".forge/agents/executor.alpha.forge", "README.md", ".forge/README.md"],
      forbiddenPathHints: [".github/workflows/**", ".forge/policies/**", ".forge/network/**"],
      requiresHumanReviewBeforePlanning: false,
    },
    ...overrides,
  };
}

function readyWorktreePlan(taskOverrides = {}, worktreeOptions = {}) {
  const plan = createPlanSpecFromTaskCandidate(executorTask(taskOverrides), { createdAt: CREATED_AT });
  const result = createBranchWorktreePlan(plan, { now: CREATED_AT, defaultBranch: "main", ...worktreeOptions });
  assert.equal(result.status, "ready", JSON.stringify(result, null, 2));
  return result.plan;
}

describe("T019 executor sandbox harness", () => {
  it("declares a manifest-only sandbox contract with no command execution side effects", () => {
    assert.equal(EXECUTOR_SANDBOX_HARNESS_CONTRACT.oneTaskOnePr, true);
    assert.equal(EXECUTOR_SANDBOX_HARNESS_CONTRACT.defaultNetworkMode, "off");
    assert.equal(EXECUTOR_SANDBOX_HARNESS_CONTRACT.defaultGithubTokenMode, "none");
    assert.ok(EXECUTOR_SANDBOX_HARNESS_CONTRACT.forbids.includes("command_execution_in_harness"));
    assert.ok(EXECUTOR_SANDBOX_HARNESS_CONTRACT.forbids.includes("git_push"));
    assert.ok(EXECUTOR_SANDBOX_HARNESS_CONTRACT.validates.includes("output_artifacts"));
  });

  it("creates one deterministic sandbox execution request from one T018 worktree manifest", () => {
    const worktree = readyWorktreePlan();
    const first = createSandboxExecutionRequest(worktree, { now: CREATED_AT });
    const second = createSandboxExecutionRequest(worktree, { now: CREATED_AT });

    assert.equal(first.status, "ready", JSON.stringify(first, null, 2));
    assert.deepEqual(first, second);
    assert.ok(first.request);
    assert.equal(first.request.schema_ref, "urn:forgeroot:sandbox-execution-request:v1");
    assert.equal(first.request.plan_id, worktree.plan_id);
    assert.equal(first.request.worktree_manifest_id, worktree.manifest_id);
    assert.equal(first.request.isolation.network.mode, "off");
    assert.deepEqual(first.request.isolation.network.allowed_hosts, []);
    assert.equal(first.request.isolation.secrets.mount, false);
    assert.equal(first.request.isolation.github_token.mode, "none");
    assert.equal(first.request.filesystem.worktree_path, worktree.worktree.path);
    assert.equal(first.request.filesystem.artifacts_outside_worktree, true);
    assert.ok(!first.request.filesystem.artifact_root.startsWith(`${worktree.worktree.path}/`));
    assert.deepEqual(first.request.scope.mutable_paths, worktree.scope.mutable_paths);
    assert.equal(first.request.guards.no_pr_creation, true);
    assert.equal(first.request.guards.no_audit_report_generation, true);
    assert.deepEqual(validateSandboxExecutionRequest(first.request), { ok: true, issues: [] });
  });

  it("blocks sandbox requests when a manifest still requires execution approval", () => {
    const worktree = readyWorktreePlan();
    const elevated = {
      ...worktree,
      approval: {
        ...worktree.approval,
        approval_class: "C",
        risk: "high",
        human_review_required_before_execution: true,
        approved_for_execution: false,
        approval_ref: null,
      },
    };

    const result = createSandboxExecutionRequest(elevated, { now: CREATED_AT });
    assert.equal(result.status, "blocked");
    assert.equal(result.request, undefined);
    assert.ok(result.reasons.includes("human_review_required_before_sandbox_request"));
  });

  it("rejects malformed branch/worktree manifests before sandbox derivation", () => {
    const result = createSandboxExecutionRequest({}, { now: CREATED_AT });
    assert.equal(result.status, "invalid");
    assert.ok(result.reasons.includes("invalid_branch_worktree_plan"));
    assert.ok(result.issues.length > 0);
  });

  it("rejects forbidden git, shell, and non-allowlisted command binaries", () => {
    const worktree = readyWorktreePlan();

    const git = createSandboxExecutionRequest(worktree, {
      now: CREATED_AT,
      commands: [{ id: "push", phase: "execute", argv: ["git", "push"], writable_paths: [] }],
    });
    assert.equal(git.status, "invalid");
    assert.ok(git.reasons.includes("forbidden_command_binary:git"));

    const shell = createSandboxExecutionRequest(worktree, {
      now: CREATED_AT,
      commands: [{ id: "shell", phase: "execute", argv: ["bash", "-c", "echo unsafe"], writable_paths: [] }],
    });
    assert.equal(shell.status, "invalid");
    assert.ok(shell.reasons.includes("forbidden_command_binary:bash"));

    const unknown = createSandboxExecutionRequest(worktree, {
      now: CREATED_AT,
      commands: [{ id: "python", phase: "verify", argv: ["python", "script.py"], writable_paths: [] }],
    });
    assert.equal(unknown.status, "invalid");
    assert.ok(unknown.reasons.includes("command_binary_not_allowlisted:python"));
  });

  it("rejects command writable paths outside mutable scope or inside immutable scope", () => {
    const worktree = readyWorktreePlan();

    const outside = createSandboxExecutionRequest(worktree, {
      now: CREATED_AT,
      commands: [{ id: "outside", phase: "execute", argv: ["node", "tools/apply.mjs"], writable_paths: ["src/unrelated.ts"] }],
    });
    assert.equal(outside.status, "invalid");
    assert.ok(outside.reasons.some((reason) => reason.startsWith("command_writable_path_out_of_scope:outside:src/unrelated.ts")));

    const immutable = createSandboxExecutionRequest(worktree, {
      now: CREATED_AT,
      commands: [{ id: "policy", phase: "execute", argv: ["node", "tools/apply.mjs"], writable_paths: [".forge/policies/runtime-mode.forge"] }],
    });
    assert.equal(immutable.status, "invalid");
    assert.ok(immutable.reasons.some((reason) => reason.startsWith("command_writable_path_out_of_scope:policy:.forge/policies/runtime-mode.forge")));
  });

  it("rejects secret-bearing environment variables and locked default overrides", () => {
    const worktree = readyWorktreePlan();

    const secretName = createSandboxExecutionRequest(worktree, { now: CREATED_AT, env: { GITHUB_TOKEN: "not-allowed" } });
    assert.equal(secretName.status, "invalid");
    assert.ok(secretName.reasons.includes("env_name_forbidden:GITHUB_TOKEN"));

    const secretValue = createSandboxExecutionRequest(worktree, { now: CREATED_AT, env: { SAFE_FLAG: "ghp_notallowed" } });
    assert.equal(secretValue.status, "invalid");
    assert.ok(secretValue.reasons.includes("env_value_looks_secret:SAFE_FLAG"));

    const locked = createSandboxExecutionRequest(worktree, { now: CREATED_AT, env: { FORGE_SANDBOX: "0" } });
    assert.equal(locked.status, "invalid");
    assert.ok(locked.reasons.includes("env_locked_variable_override:FORGE_SANDBOX"));
  });

  it("keeps network disabled by default and only allows explicit safe allowlists", () => {
    const worktree = readyWorktreePlan();

    const defaultResult = createSandboxExecutionRequest(worktree, { now: CREATED_AT });
    assert.equal(defaultResult.status, "ready");
    assert.equal(defaultResult.request.isolation.network.mode, "off");

    const offWithHosts = createSandboxExecutionRequest(worktree, { now: CREATED_AT, networkAllowedHosts: ["api.github.com"] });
    assert.equal(offWithHosts.status, "invalid");
    assert.ok(offWithHosts.reasons.includes("network_off_requires_empty_allowlist"));

    const allowlisted = createSandboxExecutionRequest(worktree, {
      now: CREATED_AT,
      networkMode: "allowlisted",
      networkAllowedHosts: ["api.github.com"],
      githubTokenMode: "read_only",
    });
    assert.equal(allowlisted.status, "ready", JSON.stringify(allowlisted, null, 2));
    assert.deepEqual(allowlisted.request.isolation.network.allowed_hosts, ["api.github.com"]);
    assert.deepEqual(allowlisted.request.isolation.github_token.permissions, ["contents:read", "metadata:read"]);

    const unsafeHost = createSandboxExecutionRequest(worktree, { now: CREATED_AT, networkMode: "allowlisted", networkAllowedHosts: ["localhost"] });
    assert.equal(unsafeHost.status, "invalid");
    assert.ok(unsafeHost.reasons.includes("network_host_invalid:localhost"));
  });

  it("rejects artifact roots inside the worktree", () => {
    const worktree = readyWorktreePlan();
    const result = createSandboxExecutionRequest(worktree, {
      now: CREATED_AT,
      artifactRoot: `${worktree.worktree.path}/.forgeroot/artifacts/bad`,
    });
    assert.equal(result.status, "invalid");
    assert.ok(result.reasons.includes("artifact_root_must_be_outside_worktree"));
  });

  it("validates observed sandbox output against declared commands, path scope, and artifacts", () => {
    const worktree = readyWorktreePlan();
    const result = createSandboxExecutionRequest(worktree, { now: CREATED_AT });
    assert.equal(result.status, "ready");

    const observed = validateSandboxObservedOutput(result.request, {
      command_ids: ["inspect_scope", "apply_bounded_patch", "run_verification", "collect_artifacts"],
      changed_paths: ["README.md", "packages/executor/src/sandbox.ts"],
      artifacts: [
        { path: "patch.diff", bytes: 1200, media_type: "text/x-diff", sha256: `sha256:${"a".repeat(64)}` },
        { path: "changed-paths.json", bytes: 120, media_type: "application/json" },
        { path: "sandbox-report.json", bytes: 512, media_type: "application/json" },
      ],
      environment: { SAFE_FLAG: "1" },
    });

    assert.equal(observed.ok, true, JSON.stringify(observed, null, 2));
    assert.deepEqual(observed.acceptedPaths, ["README.md", "packages/executor/src/sandbox.ts"]);
    assert.deepEqual(observed.rejectedPaths, []);
  });

  it("rejects observed output that escapes commands, mutable paths, or declared artifacts", () => {
    const worktree = readyWorktreePlan();
    const result = createSandboxExecutionRequest(worktree, { now: CREATED_AT });
    assert.equal(result.status, "ready");

    const observed = validateSandboxObservedOutput(result.request, {
      command_ids: ["apply_bounded_patch", "undeclared"],
      changed_paths: [".github/workflows/ci.yml", "src/unrelated.ts", "../escape"],
      artifacts: [
        { path: "extra.txt", bytes: 1, media_type: "text/plain" },
        { path: "patch.diff", bytes: result.request.artifacts.find((artifact) => artifact.path === "patch.diff").max_bytes + 1, media_type: "text/x-diff" },
      ],
      environment: { NPM_TOKEN: "not-allowed" },
    });

    assert.equal(observed.ok, false);
    assert.ok(observed.reasons.includes("undeclared_command_observed"));
    assert.ok(observed.reasons.includes("immutable_path_changed"));
    assert.ok(observed.reasons.includes("path_outside_mutable_scope"));
    assert.ok(observed.reasons.includes("invalid_changed_path"));
    assert.ok(observed.reasons.includes("undeclared_artifact_observed"));
    assert.ok(observed.reasons.includes("artifact_size_exceeded"));
    assert.ok(observed.reasons.includes("invalid_observed_environment"));
  });
});
